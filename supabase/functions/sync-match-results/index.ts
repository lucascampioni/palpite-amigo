import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FOOTBALL_DATA_API_KEY = Deno.env.get('FOOTBALL_DATA_API_KEY');

async function getMatchById(matchId: string): Promise<any> {
  if (!FOOTBALL_DATA_API_KEY) {
    throw new Error('FOOTBALL_DATA_API_KEY not configured');
  }

  const response = await fetch(
    `https://api.football-data.org/v4/matches/${matchId}`,
    {
      headers: {
        'X-Auth-Token': FOOTBALL_DATA_API_KEY,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Football-Data API error: ${response.status}`);
  }

  const data = await response.json();
  return data || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('❌ Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - authentication required', success: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('✅ Authenticated request');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting match results sync from football-data.org...');

    if (!FOOTBALL_DATA_API_KEY) {
      console.error('FOOTBALL_DATA_API_KEY not found');
      return new Response(JSON.stringify({ 
        error: 'API key not configured',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all matches from football-data source that are not finished
    const { data: matches, error: fetchError } = await supabase
      .from('football_matches')
      .select('*, pools!inner(scoring_system)')
      .or('external_source.eq.ge,external_source.eq.apifb')
      .neq('status', 'finished');

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${matches?.length || 0} matches to check`);

    let updatedCount = 0;
    let finishedPoolIds = new Set<string>();

    for (const match of matches || []) {
      try {
        // Extract match ID from external_id (format: fd_123456)
        if (!match.external_id || !match.external_id.startsWith('fd_')) {
          console.log(`Skipping match without valid external_id: ${match.id}`);
          continue;
        }

        const matchId = match.external_id.replace('fd_', '');
        console.log(`Checking match ${matchId}: ${match.home_team} vs ${match.away_team}`);

        // Fetch match data from football-data.org
        const matchData = await getMatchById(matchId);
        
        if (!matchData) {
          console.log(`No data found for match ${matchId}`);
          continue;
        }

        const status = matchData.status;
        const isFinished = status === 'FINISHED';

        if (isFinished) {
          const homeScore = matchData.score?.fullTime?.home;
          const awayScore = matchData.score?.fullTime?.away;

          if (homeScore !== null && awayScore !== null) {
            console.log(`Match finished: ${match.home_team} ${homeScore} x ${awayScore} ${match.away_team}`);

            // Update match with result
            const { error: updateError } = await supabase
              .from('football_matches')
              .update({
                home_score: homeScore,
                away_score: awayScore,
                status: 'finished',
                last_sync_at: new Date().toISOString()
              })
              .eq('id', match.id);

            if (!updateError) {
              updatedCount++;
              finishedPoolIds.add(match.pool_id);
              
              // Get scoring system from pool
              const scoringSystem = (match.pools as any)?.scoring_system || 'standard';
              
              // Calculate points for all predictions for this match
              const { data: predictions } = await supabase
                .from('football_predictions')
                .select('*')
                .eq('match_id', match.id);

              if (predictions) {
                for (const prediction of predictions) {
                  const { data: points } = await supabase.rpc('calculate_football_points', {
                    predicted_home: prediction.home_score_prediction,
                    predicted_away: prediction.away_score_prediction,
                    actual_home: homeScore,
                    actual_away: awayScore,
                    scoring_system: scoringSystem
                  });

                  await supabase
                    .from('football_predictions')
                    .update({ points_earned: points || 0 })
                    .eq('id', prediction.id);
                }
              }
              
              console.log(`Updated match: ${match.home_team} vs ${match.away_team}`);
            }
          }
        } else {
          console.log(`Match not finished yet (status: ${status}): ${match.home_team} vs ${match.away_team}`);
        }

        // Small delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Error processing match ${match.id}:`, error);
      }
    }

    // Check if any pools are now complete and calculate winners
    for (const poolId of finishedPoolIds) {
      try {
        // Check if all matches in the pool are finished
        const { data: poolMatches } = await supabase
          .from('football_matches')
          .select('status')
          .eq('pool_id', poolId);

        const allFinished = poolMatches?.every(m => m.status === 'finished');

        if (allFinished) {
          console.log(`All matches finished for pool ${poolId}, calculating winner...`);

          // Get all participants with their total points
          const { data: participants } = await supabase
            .from('participants')
            .select(`
              id,
              user_id,
              participant_name,
              football_predictions!inner(points_earned)
            `)
            .eq('pool_id', poolId)
            .eq('status', 'approved');

          if (participants && participants.length > 0) {
            // Calculate total points for each participant
            const participantPoints = participants.map(p => {
              const totalPoints = (p.football_predictions as any[])
                .reduce((sum: number, pred: any) => sum + (pred.points_earned || 0), 0);
              
              return {
                participant_id: p.id,
                user_id: p.user_id,
                name: p.participant_name,
                points: totalPoints
              };
            });

            // Find winner (highest points)
            const winner = participantPoints.reduce((max, p) => 
              p.points > max.points ? p : max
            );

            console.log(`Winner: ${winner.name} with ${winner.points} points`);

            // Update pool with winner
            await supabase
              .from('pools')
              .update({
                status: 'finished',
                winner_id: winner.user_id,
                result_value: `Vencedor: ${winner.name} com ${winner.points} pontos`
              })
              .eq('id', poolId);
          }
        }
      } catch (error) {
        console.error(`Error calculating winner for pool ${poolId}:`, error);
      }
    }

    console.log(`Sync complete. Updated ${updatedCount} matches.`);

    return new Response(JSON.stringify({ 
      success: true,
      checkedMatches: matches?.length || 0,
      updatedMatches: updatedCount,
      finishedPools: finishedPoolIds.size
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error syncing match results:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});