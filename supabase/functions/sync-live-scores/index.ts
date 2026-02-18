import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY');
const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';
const DAILY_LIMIT = 95; // safety margin below 100

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

    // 6. Fallback: check DB matches marked as live that were NOT in the live feed
    // This handles matches that finished between sync intervals
    const liveDbStatuses = ['1H', '2H', 'HT', 'ET', 'P'];
    const { data: stillLiveInDb } = await supabase
      .from('football_matches')
      .select('id, external_id, pool_id, home_team, away_team, status, match_date, home_score, away_score')
      .in('status', liveDbStatuses)
      .not('external_id', 'is', null);

    if (stillLiveInDb && stillLiveInDb.length > 0) {
      // Filter out matches that were already updated from the live feed
      const liveFixtureExternalIds = new Set(
        fixtures.map((f: any) => `apifb_${f.fixture?.id}`)
      );
      const missedMatches = stillLiveInDb.filter(
        (m: any) => !liveFixtureExternalIds.has(m.external_id)
      );

      if (missedMatches.length > 0 && dailyCount < DAILY_LIMIT) {
        console.log(`🔍 Found ${missedMatches.length} matches still live in DB but not in feed. Fetching today's fixtures...`);
        
        // Use /fixtures?date=today which works on free plan (1 request for all today's games)
        const todayStr = new Date().toISOString().split('T')[0];
        const fallbackResp = await fetch(`${API_FOOTBALL_BASE}/fixtures?date=${todayStr}`, {
          headers: { 'x-apisports-key': API_FOOTBALL_KEY },
        });
        dailyCount++;

        if (fallbackResp.ok) {
          const fallbackData = await fallbackResp.json();
          const allTodayFixtures = fallbackData.response || [];
          console.log(`📋 Fallback: got ${allTodayFixtures.length} fixtures for ${todayStr}`);

          // Build a lookup by external_id
          const fixtureMap = new Map<string, any>();
          for (const f of allTodayFixtures) {
            fixtureMap.set(`apifb_${f.fixture?.id}`, f);
          }

          for (const missed of missedMatches) {
            const fbFixture = fixtureMap.get(missed.external_id);
            if (!fbFixture) {
              // Safety net: if match kicked off >3h ago and not in any feed, mark as finished
              const kickoff = new Date(missed.match_date).getTime();
              const now = Date.now();
              const hoursSinceKickoff = (now - kickoff) / (1000 * 60 * 60);
              
              if (hoursSinceKickoff >= 2.5 && missed.home_score !== null && missed.away_score !== null) {
                console.log(`⏰ Safety net: ${missed.home_team} vs ${missed.away_team} started ${hoursSinceKickoff.toFixed(1)}h ago, marking as finished with last known score ${missed.home_score}-${missed.away_score}`);
                
                const { data: poolData } = await supabase
                  .from('pools')
                  .select('scoring_system')
                  .eq('id', missed.pool_id)
                  .single();

                await supabase
                  .from('football_matches')
                  .update({
                    status: 'finished',
                    last_sync_at: new Date().toISOString(),
                  })
                  .eq('id', missed.id);

                updatedCount++;
                finishedPoolIds.add(missed.pool_id);
                const matchWithPool = { ...missed, pools: { scoring_system: poolData?.scoring_system || 'standard' } };
                await calculateMatchPoints(supabase, matchWithPool, missed.home_score, missed.away_score);
              } else {
                console.log(`⚠️ Fixture ${missed.external_id} not found in today's feed (${hoursSinceKickoff.toFixed(1)}h since kickoff)`);
              }
              continue;
            }

            const fbStatus = mapApiStatus(fbFixture.fixture?.status?.short);
            const fbHome = fbFixture.goals?.home ?? null;
            const fbAway = fbFixture.goals?.away ?? null;

            console.log(`📋 Fallback: ${missed.home_team} -> status=${fbStatus}, score=${fbHome}-${fbAway}`);

            const { data: poolData } = await supabase
              .from('pools')
              .select('scoring_system')
              .eq('id', missed.pool_id)
              .single();

            const { error: fbUpdateError } = await supabase
              .from('football_matches')
              .update({
                home_score: fbHome,
                away_score: fbAway,
                status: fbStatus,
                last_sync_at: new Date().toISOString(),
              })
              .eq('id', missed.id);

            if (fbUpdateError) {
              console.error(`❌ Fallback update error for ${missed.id}:`, fbUpdateError);
              continue;
            }

            updatedCount++;
            console.log(`✅ Fallback updated: ${missed.home_team} ${fbHome} x ${fbAway} ${missed.away_team} [${fbStatus}]`);

            if (fbStatus === 'finished' && fbHome !== null && fbAway !== null) {
              finishedPoolIds.add(missed.pool_id);
              const matchWithPool = { ...missed, pools: { scoring_system: poolData?.scoring_system || 'standard' } };
              await calculateMatchPoints(supabase, matchWithPool, fbHome, fbAway);
            }
          }
        }

        // Update daily count after fallback requests
        if (controlRow) {
          await supabase
            .from('api_sync_control')
            .update({
              daily_request_count: dailyCount,
              request_count_date: today,
            })
            .eq('id', controlRow.id);
        }
      }
    }

    // 7. Check if any pools are now complete
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

async function checkPoolCompletion(supabase: any, poolId: string) {
  const { data: poolMatches } = await supabase
    .from('football_matches')
    .select('status')
    .eq('pool_id', poolId);

  const allFinished = poolMatches?.every((m: any) => m.status === 'finished');
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
}
