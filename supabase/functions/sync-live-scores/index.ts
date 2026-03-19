import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY');
const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';
const DAILY_LIMIT = 2900; // Pro plan: 7500/day, safety margin

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('🔄 Starting live scores sync...');

    if (!API_FOOTBALL_KEY) {
      throw new Error('API_FOOTBALL_KEY not configured');
    }

    // 1. Check daily rate limit
    const today = new Date().toISOString().split('T')[0];
    const { data: controlRow } = await supabase
      .from('api_sync_control')
      .select('*')
      .eq('sync_type', 'live_scores')
      .is('league_id', null)
      .single();

    let dailyCount = controlRow?.daily_request_count || 0;
    const countDate = controlRow?.request_count_date;

    // Reset counter if new day
    if (countDate !== today) {
      dailyCount = 0;
    }

    if (dailyCount >= DAILY_LIMIT) {
      console.log(`🛑 Daily limit reached (${dailyCount}/${DAILY_LIMIT}). Skipping.`);
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'daily_limit_reached',
        dailyCount,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Check if there are any live/upcoming matches in the DB
    const { data: liveMatches } = await supabase
      .from('football_matches')
      .select('id, status')
      .in('status', ['1H', '2H', 'HT', 'ET', 'P', 'scheduled', 'NS'])
      .not('external_id', 'is', null);

    // Also check if any match is happening today (kickoff within today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { data: todayMatches } = await supabase
      .from('football_matches')
      .select('id')
      .gte('match_date', todayStart.toISOString())
      .lte('match_date', todayEnd.toISOString())
      .neq('status', 'finished')
      .neq('status', 'FT')
      .not('external_id', 'is', null);

    const hasLiveOrToday = (liveMatches && liveMatches.length > 0) || (todayMatches && todayMatches.length > 0);

    if (!hasLiveOrToday) {
      console.log('⏸️ No live or today matches found. Skipping API call.');
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'no_live_matches',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Call API-Football: GET /fixtures?live=all (single request for ALL live games)
    console.log('📡 Calling API-Football /fixtures?live=all ...');
    const response = await fetch(`${API_FOOTBALL_BASE}/fixtures?live=all`, {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
    });

    if (!response.ok) {
      throw new Error(`API-Football error: ${response.status} ${response.statusText}`);
    }

    const apiData = await response.json();
    const fixtures = apiData.response || [];
    dailyCount++;

    console.log(`📊 API returned ${fixtures.length} live fixtures. Daily count: ${dailyCount}`);

    // 4. Update daily request count
    if (controlRow) {
      await supabase
        .from('api_sync_control')
        .update({
          daily_request_count: dailyCount,
          request_count_date: today,
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', controlRow.id);
    }

    // 5. Match API fixtures with our DB matches and update
    let updatedCount = 0;
    const finishedPoolIds = new Set<string>();

    for (const fixture of fixtures) {
      const apiFixtureId = String(fixture.fixture?.id);
      const externalId = `apifb_${apiFixtureId}`;

      // 1) Try exact external_id match
      let { data: dbMatch } = await supabase
        .from('football_matches')
        .select('*, pools!inner(scoring_system)')
        .eq('external_id', externalId)
        .maybeSingle();

      // 2) If external_id is stale/wrong, reconcile by team names + kickoff proximity
      if (!dbMatch) {
        dbMatch = await findDbMatchForLiveFixture(supabase, fixture);
      }

      if (!dbMatch) continue;

      const apiStatus = fixture.fixture?.status?.short; // NS, 1H, HT, 2H, FT, etc.
      const mappedStatus = mapApiStatus(apiStatus);
      const homeGoals = fixture.goals?.home ?? null;
      const awayGoals = fixture.goals?.away ?? null;

      const statusChanged = dbMatch.status !== mappedStatus;
      const homeScoreChanged = homeGoals !== null && dbMatch.home_score !== homeGoals;
      const awayScoreChanged = awayGoals !== null && dbMatch.away_score !== awayGoals;
      const scoreChanged = homeScoreChanged || awayScoreChanged;
      const externalIdChanged = dbMatch.external_id !== externalId;

      if (!statusChanged && !scoreChanged && !externalIdChanged) continue;

      const updateData: any = {
        status: mappedStatus,
        last_sync_at: new Date().toISOString(),
      };
      if (homeGoals !== null) updateData.home_score = homeGoals;
      if (awayGoals !== null) updateData.away_score = awayGoals;
      if (externalIdChanged) updateData.external_id = externalId;

      const { error: updateError } = await supabase
        .from('football_matches')
        .update(updateData)
        .eq('id', dbMatch.id);

      if (updateError) {
        console.error(`❌ Error updating match ${dbMatch.id}:`, updateError);
        continue;
      }

      updatedCount++;
      console.log(`✅ Updated: ${dbMatch.home_team} ${homeGoals ?? '-'} x ${awayGoals ?? '-'} ${dbMatch.away_team} [${dbMatch.status} → ${mappedStatus}]`);

      // If match finished, calculate points
      if (mappedStatus === 'finished' && homeGoals !== null && awayGoals !== null) {
        finishedPoolIds.add(dbMatch.pool_id);
        await calculateMatchPoints(supabase, dbMatch, homeGoals, awayGoals);
      }
    }

    // 6. Fallback: check matches stuck as live in DB but missing from live feed
    //    If API lookup by fixture ID fails, fallback to date + team matching and self-heal external_id.
    const liveDbStatuses = ['1H', '2H', 'HT', 'ET', 'P'];
    const { data: stillLiveInDb } = await supabase
      .from('football_matches')
      .select('id, external_id, pool_id, home_team, away_team, status, match_date, home_score, away_score')
      .in('status', liveDbStatuses)
      .not('external_id', 'is', null);

    if (stillLiveInDb && stillLiveInDb.length > 0) {
      const liveFixtureExternalIds = new Set(
        fixtures.map((f: any) => `apifb_${f.fixture?.id}`)
      );
      const missedMatches = stillLiveInDb.filter(
        (m: any) => !liveFixtureExternalIds.has(m.external_id)
      );

      if (missedMatches.length > 0) {
        console.log(`🔍 Found ${missedMatches.length} matches no longer in live feed. Fetching individually...`);

        for (const missed of missedMatches) {
          if (dailyCount >= DAILY_LIMIT) break;

          try {
            const { fixture: fbFixture, requestsMade } = await fetchFixtureWithFallback(missed);
            dailyCount += requestsMade;

            if (fbFixture) {
              const fbStatus = mapApiStatus(fbFixture.fixture?.status?.short);
              const fbHome = fbFixture.goals?.home ?? null;
              const fbAway = fbFixture.goals?.away ?? null;
              const resolvedExternalId = `apifb_${fbFixture.fixture?.id}`;

              const statusChanged = missed.status !== fbStatus;
              const scoreChanged = missed.home_score !== fbHome || missed.away_score !== fbAway;
              const externalIdChanged = missed.external_id !== resolvedExternalId;

              if (statusChanged || scoreChanged || externalIdChanged) {
                const updateData: any = {
                  status: fbStatus,
                  last_sync_at: new Date().toISOString(),
                };

                // Always update scores if available (including 0)
                if (fbHome !== null) updateData.home_score = fbHome;
                if (fbAway !== null) updateData.away_score = fbAway;
                if (externalIdChanged) updateData.external_id = resolvedExternalId;

                await supabase
                  .from('football_matches')
                  .update(updateData)
                  .eq('id', missed.id);

                updatedCount++;
                console.log(`✅ Fallback update: ${missed.home_team} ${fbHome} x ${fbAway} ${missed.away_team} [${missed.status} → ${fbStatus}]`);

                if (fbStatus === 'finished' && fbHome !== null && fbAway !== null) {
                  finishedPoolIds.add(missed.pool_id);
                  const { data: poolData } = await supabase
                    .from('pools')
                    .select('scoring_system')
                    .eq('id', missed.pool_id)
                    .single();
                  const matchWithPool = { ...missed, pools: { scoring_system: poolData?.scoring_system || 'standard' } };
                  await calculateMatchPoints(supabase, matchWithPool, fbHome, fbAway);
                }
              } else {
                console.log(`⏸️ No change for: ${missed.home_team} vs ${missed.away_team} [${fbStatus}]`);
              }

              continue;
            }
          } catch (fbError) {
            console.error(`❌ Fallback lookup error for match ${missed.id}:`, fbError);
          }

          // Do NOT force phase/finish when fixture lookup fails.
          // Keeping current status is safer than writing wrong status/score.
          console.warn(`⚠️ Could not reconcile fixture for ${missed.home_team} vs ${missed.away_team}; keeping current status (${missed.status}).`);
        }

        // Update daily count
        if (controlRow) {
          await supabase
            .from('api_sync_control')
            .update({ daily_request_count: dailyCount, request_count_date: today })
            .eq('id', controlRow.id);
        }
      }
    }

    // 7. Proactive check: fetch matches whose kickoff was 5+ min ago but still "scheduled" in DB
    //    This catches matches that started but weren't in the live feed when we checked
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: missedScheduled } = await supabase
      .from('football_matches')
      .select('id, external_id, pool_id, home_team, away_team, status, match_date, home_score, away_score')
      .eq('status', 'scheduled')
      .lt('match_date', fiveMinAgo)
      .not('external_id', 'is', null);

    if (missedScheduled && missedScheduled.length > 0) {
      console.log(`🕐 Found ${missedScheduled.length} scheduled matches past kickoff. Fetching results...`);

      for (const missed of missedScheduled) {
        if (dailyCount >= DAILY_LIMIT) break;

        try {
          const { fixture: fbFixture, requestsMade } = await fetchFixtureWithFallback(missed);
          dailyCount += requestsMade;

          if (!fbFixture) continue;

          const fbStatus = mapApiStatus(fbFixture.fixture?.status?.short);
          const fbHome = fbFixture.goals?.home ?? null;
          const fbAway = fbFixture.goals?.away ?? null;
          const resolvedExternalId = `apifb_${fbFixture.fixture?.id}`;

          const statusChanged = fbStatus !== missed.status;
          const scoreChanged = (fbHome !== null && fbHome !== missed.home_score) || (fbAway !== null && fbAway !== missed.away_score);
          const externalIdChanged = missed.external_id !== resolvedExternalId;

          if (statusChanged || scoreChanged || externalIdChanged) {
            const updateData: any = {
              status: fbStatus,
              last_sync_at: new Date().toISOString(),
            };
            if (fbHome !== null) updateData.home_score = fbHome;
            if (fbAway !== null) updateData.away_score = fbAway;
            if (externalIdChanged) updateData.external_id = resolvedExternalId;

            await supabase
              .from('football_matches')
              .update(updateData)
              .eq('id', missed.id);

            updatedCount++;
            console.log(`✅ Missed match recovered: ${missed.home_team} ${fbHome} x ${fbAway} ${missed.away_team} [${missed.status} → ${fbStatus}]`);

            if (fbStatus === 'finished' && fbHome !== null && fbAway !== null) {
              finishedPoolIds.add(missed.pool_id);
              const { data: poolData } = await supabase
                .from('pools')
                .select('scoring_system')
                .eq('id', missed.pool_id)
                .single();
              const matchWithPool = { ...missed, pools: { scoring_system: poolData?.scoring_system || 'standard' } };
              await calculateMatchPoints(supabase, matchWithPool, fbHome, fbAway);
            }
          }
        } catch (fbError) {
          console.error(`❌ Missed match fetch error for match ${missed.id}:`, fbError);
        }
      }

      // Update daily count after missed matches
      if (controlRow) {
        await supabase
          .from('api_sync_control')
          .update({ daily_request_count: dailyCount, request_count_date: today })
          .eq('id', controlRow.id);
      }
    }

    // 8. Check if any pools are now complete
    for (const poolId of finishedPoolIds) {
      await checkPoolCompletion(supabase, poolId);
    }

    console.log(`🏁 Sync complete. Updated ${updatedCount} matches.`);

    return new Response(JSON.stringify({
      success: true,
      liveFixtures: fixtures.length,
      updatedMatches: updatedCount,
      finishedPools: finishedPoolIds.size,
      dailyCount,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('❌ Error in live scores sync:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function mapApiStatus(apiStatus: string): string {
  const statusMap: Record<string, string> = {
    'NS': 'scheduled',   // Not Started
    'TBD': 'scheduled',  // To Be Defined
    '1H': '1H',          // First Half
    'HT': 'HT',          // Half Time
    '2H': '2H',          // Second Half
    'ET': 'ET',          // Extra Time
    'P': 'P',            // Penalty
    'FT': 'finished',    // Full Time
    'AET': 'finished',   // After Extra Time
    'PEN': 'finished',   // After Penalty
    'BT': 'finished',    // Break Time (finished)
    'SUSP': 'suspended',
    'INT': 'interrupted',
    'PST': 'postponed',
    'CANC': 'cancelled',
    'ABD': 'abandoned',
    'AWD': 'finished',   // Technical Loss
    'WO': 'finished',    // WalkOver
    'LIVE': '1H',        // Live (generic)
  };
  return statusMap[apiStatus] || 'scheduled';
}

function extractApiFixtureId(externalId: string | null | undefined): string | null {
  if (!externalId) return null;
  const candidate = externalId.startsWith('apifb_') ? externalId.slice(6) : externalId;
  return /^\d+$/.test(candidate) ? candidate : null;
}

function normalizeTeamName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TEAM_STOP_WORDS = new Set([
  'fc', 'sc', 'ac', 'ec', 'cd', 'cf', 'clube', 'club', 'esporte', 'futebol', 'sport', 'de', 'da', 'do', 'the',
]);

function tokenizeTeamName(name: string): string[] {
  const normalized = normalizeTeamName(name);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .filter(Boolean)
    .filter((token) => !TEAM_STOP_WORDS.has(token));
}

function scoreTeamSimilarity(apiName: string, targetName: string): number {
  if (!apiName || !targetName) return 0;

  const apiNormalized = normalizeTeamName(apiName);
  const targetNormalized = normalizeTeamName(targetName);

  if (!apiNormalized || !targetNormalized) return 0;
  if (apiNormalized === targetNormalized) return 1;

  const apiCompact = apiNormalized.replace(/\s+/g, '');
  const targetCompact = targetNormalized.replace(/\s+/g, '');

  if (apiCompact === targetCompact) return 0.98;
  if (apiCompact.includes(targetCompact) || targetCompact.includes(apiCompact)) return 0.92;

  const apiTokens = tokenizeTeamName(apiName);
  const targetTokens = tokenizeTeamName(targetName);
  if (apiTokens.length === 0 || targetTokens.length === 0) return 0;

  const targetSet = new Set(targetTokens);
  const intersection = apiTokens.filter((token) => targetSet.has(token)).length;
  const overlap = intersection / Math.max(apiTokens.length, targetTokens.length);

  if (overlap >= 0.8) return 0.88;
  if (overlap >= 0.6) return 0.74;
  if (overlap >= 0.5) return 0.62;

  return 0;
}

function getFixtureKickoffTime(fixture: any): number | null {
  const rawDate = fixture?.fixture?.date;
  if (!rawDate) return null;
  const timestamp = new Date(rawDate).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

async function findDbMatchForLiveFixture(supabase: any, fixture: any): Promise<any | null> {
  const kickoffTs = getFixtureKickoffTime(fixture);
  if (!kickoffTs) return null;

  const windowStart = new Date(kickoffTs - 10 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(kickoffTs + 10 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabase
    .from('football_matches')
    .select('*, pools!inner(scoring_system)')
    .eq('external_source', 'apifb')
    .in('status', ['scheduled', 'NS', '1H', 'HT', '2H', 'ET', 'P'])
    .gte('match_date', windowStart)
    .lte('match_date', windowEnd);

  if (error || !candidates || candidates.length === 0) return null;

  const apiHome = fixture.teams?.home?.name || '';
  const apiAway = fixture.teams?.away?.name || '';

  let bestMatch: any = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const homeScore = scoreTeamSimilarity(apiHome, candidate.home_team || '');
    const awayScore = scoreTeamSimilarity(apiAway, candidate.away_team || '');
    if (homeScore === 0 || awayScore === 0) continue;

    const candidateKickoffTs = new Date(candidate.match_date).getTime();
    const minuteDiff = Math.abs(candidateKickoffTs - kickoffTs) / (1000 * 60);
    const timePenalty = Math.min(minuteDiff / 240, 0.45); // penaliza diferenças > 4h

    const totalScore = homeScore + awayScore - timePenalty;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestMatch = candidate;
    }
  }

  if (bestMatch && bestScore >= 1.35) {
    console.log(`🔁 Reconciled live fixture by teams/date: ${bestMatch.home_team} vs ${bestMatch.away_team} (score ${bestScore.toFixed(2)})`);
    return bestMatch;
  }

  return null;
}

function formatApiDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function fetchFixtureWithFallback(match: any): Promise<{ fixture: any | null; requestsMade: number }> {
  const fixtureId = extractApiFixtureId(match.external_id);
  if (!fixtureId) {
    console.warn(`⚠️ Invalid external_id for match ${match.id}: ${match.external_id}`);
    return { fixture: null, requestsMade: 0 };
  }

  let requestsMade = 0;

  const byIdResp = await fetch(`${API_FOOTBALL_BASE}/fixtures?id=${fixtureId}`, {
    headers: { 'x-apisports-key': API_FOOTBALL_KEY! },
  });
  requestsMade++;

  if (byIdResp.ok) {
    const byIdData = await byIdResp.json();
    const byIdFixture = byIdData.response?.[0];
    if (byIdFixture) {
      return { fixture: byIdFixture, requestsMade };
    }
    console.warn(`⚠️ Empty response for fixtures?id=${fixtureId}. Trying date fallback...`);
  } else {
    console.warn(`⚠️ fixtures?id=${fixtureId} returned ${byIdResp.status}. Trying date fallback...`);
  }

  const baseDate = new Date(match.match_date);
  const dateCandidates = [
    formatApiDate(baseDate),
    formatApiDate(new Date(baseDate.getTime() - 24 * 60 * 60 * 1000)),
    formatApiDate(new Date(baseDate.getTime() + 24 * 60 * 60 * 1000)),
    formatApiDate(new Date(baseDate.getTime() - 2 * 24 * 60 * 60 * 1000)),
    formatApiDate(new Date(baseDate.getTime() + 2 * 24 * 60 * 60 * 1000)),
  ];

  const uniqueDates = [...new Set(dateCandidates)];

  for (const dateParam of uniqueDates) {
    const byDateResp = await fetch(`${API_FOOTBALL_BASE}/fixtures?date=${dateParam}`, {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY! },
    });
    requestsMade++;

    if (!byDateResp.ok) {
      console.warn(`⚠️ fixtures?date=${dateParam} returned ${byDateResp.status} for match ${match.id}`);
      continue;
    }

    const byDateData = await byDateResp.json();
    const fixturesByDate = byDateData.response || [];

    let matchedByTeams: any = null;
    let bestScore = 0;
    const targetKickoffTs = new Date(match.match_date).getTime();

    for (const fixture of fixturesByDate) {
      const homeScore = scoreTeamSimilarity(fixture.teams?.home?.name || '', match.home_team || '');
      const awayScore = scoreTeamSimilarity(fixture.teams?.away?.name || '', match.away_team || '');
      if (homeScore === 0 || awayScore === 0) continue;

      const fixtureKickoffTs = getFixtureKickoffTime(fixture) ?? targetKickoffTs;
      const minuteDiff = Math.abs(fixtureKickoffTs - targetKickoffTs) / (1000 * 60);
      const timePenalty = Math.min(minuteDiff / 360, 0.5); // penaliza diferenças > 6h
      const totalScore = homeScore + awayScore - timePenalty;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        matchedByTeams = fixture;
      }
    }

    if (matchedByTeams && bestScore >= 1.25) {
      console.log(`🔁 Matched fixture by date/teams for ${match.home_team} vs ${match.away_team} (id ${matchedByTeams.fixture?.id}, score ${bestScore.toFixed(2)})`);
      return { fixture: matchedByTeams, requestsMade };
    }
  }

  console.warn(`⚠️ Date fallback could not match teams for ${match.home_team} vs ${match.away_team}`);
  return { fixture: null, requestsMade };
}



async function calculateMatchPoints(supabase: any, match: any, homeGoals: number, awayGoals: number) {
  const scoringSystem = (match.pools as any)?.scoring_system || 'standard';

  const { data: predictions } = await supabase
    .from('football_predictions')
    .select('*')
    .eq('match_id', match.id);

  if (!predictions) return;

  for (const prediction of predictions) {
    const { data: points } = await supabase.rpc('calculate_football_points', {
      predicted_home: prediction.home_score_prediction,
      predicted_away: prediction.away_score_prediction,
      actual_home: homeGoals,
      actual_away: awayGoals,
      scoring_system: scoringSystem,
    });

    await supabase
      .from('football_predictions')
      .update({ points_earned: points || 0 })
      .eq('id', prediction.id);
  }

  console.log(`📊 Calculated points for ${predictions.length} predictions on match ${match.id}`);
}

async function recalculatePoolDeadline(supabase: any, poolId: string) {
  const { data: poolMatches } = await supabase
    .from('football_matches')
    .select('status, match_date')
    .eq('pool_id', poolId);

  if (!poolMatches || poolMatches.length === 0) return;

  // Check if ALL matches are excluded → cancel pool
  const excludedStatuses = ['postponed', 'cancelled', 'abandoned'];
  const allExcluded = poolMatches.every((m: any) => excludedStatuses.includes(m.status));
  if (allExcluded) {
    console.log(`🚫 All matches excluded for pool ${poolId}. Cancelling pool.`);
    await supabase
      .from('pools')
      .update({ status: 'cancelled' })
      .eq('id', poolId)
      .in('status', ['active', 'closed']);
    return;
  }

  // Find earliest valid (non-excluded) match
  const validMatches = poolMatches
    .filter((m: any) => !excludedStatuses.includes(m.status))
    .sort((a: any, b: any) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());

  if (validMatches.length === 0) return;

  const firstValidMatchDate = new Date(validMatches[0].match_date);
  const newDeadline = new Date(firstValidMatchDate.getTime() - 3 * 60 * 60 * 1000); // 3h before

  // Update pool deadline
  const { error } = await supabase
    .from('pools')
    .update({ deadline: newDeadline.toISOString() })
    .eq('id', poolId)
    .in('status', ['active', 'closed']);

  if (!error) {
    console.log(`📅 Pool ${poolId} deadline updated to ${newDeadline.toISOString()} (3h before first valid match)`);
  }
}

async function checkPoolCompletion(supabase: any, poolId: string) {
  const { data: poolMatches } = await supabase
    .from('football_matches')
    .select('status')
    .eq('pool_id', poolId);

  if (!poolMatches || poolMatches.length === 0) return;

  // Check if ALL matches are postponed/cancelled/abandoned → cancel pool
  const allPostponed = poolMatches.every((m: any) => ['postponed', 'cancelled', 'abandoned'].includes(m.status));
  if (allPostponed) {
    console.log(`🚫 All ${poolMatches.length} matches postponed/cancelled for pool ${poolId}. Cancelling pool.`);
    await supabase
      .from('pools')
      .update({ status: 'cancelled' })
      .eq('id', poolId)
      .in('status', ['active', 'closed']);
    return;
  }

  // Exclude postponed/cancelled matches - they don't count
  const countableMatches = poolMatches?.filter((m: any) => !['postponed', 'cancelled', 'abandoned'].includes(m.status)) || [];
  const allFinished = countableMatches.length > 0 && countableMatches.every((m: any) => m.status === 'finished');
  if (!allFinished) return;

  console.log(`🏆 All matches finished for pool ${poolId}, calculating winner...`);

  const { data: participants } = await supabase
    .from('participants')
    .select(`id, user_id, participant_name, football_predictions!inner(points_earned)`)
    .eq('pool_id', poolId)
    .eq('status', 'approved');

  if (!participants || participants.length === 0) return;

  const participantPoints = participants.map((p: any) => {
    const totalPoints = (p.football_predictions as any[])
      .reduce((sum: number, pred: any) => sum + (pred.points_earned || 0), 0);
    return { participant_id: p.id, user_id: p.user_id, name: p.participant_name, points: totalPoints };
  });

  const winner = participantPoints.reduce((max: any, p: any) => p.points > max.points ? p : max);

  console.log(`🥇 Winner: ${winner.name} with ${winner.points} points`);

  await supabase
    .from('pools')
    .update({
      status: 'finished',
      winner_id: winner.user_id,
      result_value: `Vencedor: ${winner.name} com ${winner.points} pontos`,
    })
    .eq('id', poolId);

  // Call update-football-winners to set prize_status for winners
  console.log(`🎁 Calling update-football-winners for pool ${poolId}...`);
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const response = await fetch(`${supabaseUrl}/functions/v1/update-football-winners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ pool_id: poolId }),
    });
    const result = await response.json();
    console.log(`🎁 update-football-winners result:`, result);
  } catch (winnerError) {
    console.error(`❌ Error calling update-football-winners for pool ${poolId}:`, winnerError);
  }
}
