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

      // Find matching match in our DB
      const { data: dbMatch } = await supabase
        .from('football_matches')
        .select('*, pools!inner(scoring_system)')
        .eq('external_id', externalId)
        .maybeSingle();

      if (!dbMatch) continue;

      const apiStatus = fixture.fixture?.status?.short; // NS, 1H, HT, 2H, FT, etc.
      const homeGoals = fixture.goals?.home ?? null;
      const awayGoals = fixture.goals?.away ?? null;

      const statusChanged = dbMatch.status !== mapApiStatus(apiStatus);
      const scoreChanged = dbMatch.home_score !== homeGoals || dbMatch.away_score !== awayGoals;

      if (!statusChanged && !scoreChanged) continue;

      const mappedStatus = mapApiStatus(apiStatus);

      // Update match
      const { error: updateError } = await supabase
        .from('football_matches')
        .update({
          home_score: homeGoals,
          away_score: awayGoals,
          status: mappedStatus,
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', dbMatch.id);

      if (updateError) {
        console.error(`❌ Error updating match ${dbMatch.id}:`, updateError);
        continue;
      }

      updatedCount++;
      console.log(`✅ Updated: ${dbMatch.home_team} ${homeGoals} x ${awayGoals} ${dbMatch.away_team} [${mappedStatus}]`);

      // If match finished, calculate points
      if (mappedStatus === 'finished' && homeGoals !== null && awayGoals !== null) {
        finishedPoolIds.add(dbMatch.pool_id);
        await calculateMatchPoints(supabase, dbMatch, homeGoals, awayGoals);
      }
    }

    // 6. Fallback: check matches stuck as live in DB but missing from live feed
    //    This means the match likely finished. Fetch each one individually by fixture ID.
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

          const apifbId = missed.external_id?.replace('apifb_', '');
          if (!apifbId) continue;

          try {
            const fbResp = await fetch(`${API_FOOTBALL_BASE}/fixtures?id=${apifbId}`, {
              headers: { 'x-apisports-key': API_FOOTBALL_KEY },
            });
            dailyCount++;

            if (fbResp.ok) {
              const fbData = await fbResp.json();
              const fbFixture = fbData.response?.[0];

              if (fbFixture) {
                const fbStatus = mapApiStatus(fbFixture.fixture?.status?.short);
                const fbHome = fbFixture.goals?.home ?? null;
                const fbAway = fbFixture.goals?.away ?? null;

                if (fbHome !== null && fbAway !== null) {
                  const { data: poolData } = await supabase
                    .from('pools')
                    .select('scoring_system')
                    .eq('id', missed.pool_id)
                    .single();

                  await supabase
                    .from('football_matches')
                    .update({
                      home_score: fbHome,
                      away_score: fbAway,
                      status: fbStatus,
                      last_sync_at: new Date().toISOString(),
                    })
                    .eq('id', missed.id);

                  updatedCount++;
                  console.log(`✅ Individual fallback: ${missed.home_team} ${fbHome} x ${fbAway} ${missed.away_team} [${fbStatus}]`);

                  if (fbStatus === 'finished') {
                    finishedPoolIds.add(missed.pool_id);
                    const matchWithPool = { ...missed, pools: { scoring_system: poolData?.scoring_system || 'standard' } };
                    await calculateMatchPoints(supabase, matchWithPool, fbHome, fbAway);
                  }
                  continue;
                }
              }
            }
          } catch (fbError) {
            console.error(`❌ Fallback error for fixture ${apifbId}:`, fbError);
          }

          // Safety net: mark as finished if >2.5h since kickoff and has scores
          const kickoff = new Date(missed.match_date).getTime();
          const hoursSinceKickoff = (Date.now() - kickoff) / (1000 * 60 * 60);

          if (hoursSinceKickoff >= 2.5 && missed.home_score !== null && missed.away_score !== null) {
            console.log(`⏰ Safety net: ${missed.home_team} vs ${missed.away_team} (${hoursSinceKickoff.toFixed(1)}h), marking finished`);

            const { data: poolData } = await supabase
              .from('pools')
              .select('scoring_system')
              .eq('id', missed.pool_id)
              .single();

            await supabase
              .from('football_matches')
              .update({ status: 'finished', last_sync_at: new Date().toISOString() })
              .eq('id', missed.id);

            updatedCount++;
            finishedPoolIds.add(missed.pool_id);
            const matchWithPool = { ...missed, pools: { scoring_system: poolData?.scoring_system || 'standard' } };
            await calculateMatchPoints(supabase, matchWithPool, missed.home_score, missed.away_score);
          }
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

        const apifbId = missed.external_id?.replace('apifb_', '');
        if (!apifbId || !missed.external_id?.startsWith('apifb_')) continue;

        try {
          const fbResp = await fetch(`${API_FOOTBALL_BASE}/fixtures?id=${apifbId}`, {
            headers: { 'x-apisports-key': API_FOOTBALL_KEY! },
          });
          dailyCount++;

          if (fbResp.ok) {
            const fbData = await fbResp.json();
            const fbFixture = fbData.response?.[0];

            if (fbFixture) {
              const fbStatus = mapApiStatus(fbFixture.fixture?.status?.short);
              const fbHome = fbFixture.goals?.home ?? null;
              const fbAway = fbFixture.goals?.away ?? null;

              if (fbStatus !== 'scheduled' && fbHome !== null && fbAway !== null) {
                const { data: poolData } = await supabase
                  .from('pools')
                  .select('scoring_system')
                  .eq('id', missed.pool_id)
                  .single();

                await supabase
                  .from('football_matches')
                  .update({
                    home_score: fbHome,
                    away_score: fbAway,
                    status: fbStatus,
                    last_sync_at: new Date().toISOString(),
                  })
                  .eq('id', missed.id);

                updatedCount++;
                console.log(`✅ Missed match recovered: ${missed.home_team} ${fbHome} x ${fbAway} ${missed.away_team} [${fbStatus}]`);

                if (fbStatus === 'finished') {
                  finishedPoolIds.add(missed.pool_id);
                  const matchWithPool = { ...missed, pools: { scoring_system: poolData?.scoring_system || 'standard' } };
                  await calculateMatchPoints(supabase, matchWithPool, fbHome, fbAway);
                }
              }
            }
          }
        } catch (fbError) {
          console.error(`❌ Missed match fetch error for fixture ${apifbId}:`, fbError);
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
    'ET': 'ET',           // Extra Time
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
