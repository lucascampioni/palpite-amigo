import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { pool_id } = await req.json();

    if (!pool_id) {
      throw new Error('pool_id is required');
    }

    console.log(`Processing pool ${pool_id}`);

    // Check if all countable matches are finished (exclude postponed/cancelled/abandoned)
    const { data: matches, error: matchesError } = await supabaseClient
      .from('football_matches')
      .select('id, home_score, away_score, status')
      .eq('pool_id', pool_id);

    if (matchesError) throw matchesError;

    if (!matches || matches.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No matches found for this pool' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const excludedStatuses = ['postponed', 'cancelled', 'abandoned'];
    const countableMatches = matches.filter(m => !excludedStatuses.includes(m.status));
    
    if (countableMatches.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No countable matches found for this pool' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allMatchesFinished = countableMatches.every(m => m.status === 'finished' && m.home_score !== null && m.away_score !== null);

    if (!allMatchesFinished) {
      return new Response(
        JSON.stringify({ message: 'Not all matches are finished yet' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('All matches finished, calculating winners...');

    // Get pool details for prize information
    const { data: pool, error: poolError } = await supabaseClient
      .from('pools')
      .select('first_place_prize, second_place_prize, third_place_prize, max_winners, prize_type, entry_fee, scoring_system')
      .eq('id', pool_id)
      .single();

    if (poolError) throw poolError;

    const isEstabelecimento = pool.prize_type === 'estabelecimento';

    // Get all approved participants
    const { data: participants, error: participantsError } = await supabaseClient
      .from('participants')
      .select('id, participant_name, status, created_at')
      .eq('pool_id', pool_id)
      .eq('status', 'approved');

    if (participantsError) throw participantsError;

    if (!participants || participants.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No approved participants found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate points for each participant
    const participantIds = participants.map(p => p.id);
    const { data: predictions, error: predictionsError } = await supabaseClient
      .from('football_predictions')
      .select('participant_id, points_earned, created_at, home_score_prediction, away_score_prediction, match_id')
      .in('participant_id', participantIds);

    if (predictionsError) throw predictionsError;

    // Aggregate points, exact scores, correct results, and earliest prediction time per participant
    const pointsMap: Record<string, number> = {};
    const exactScoresMap: Record<string, number> = {};
    const correctResultsMap: Record<string, number> = {};
    const earliestPredictionMap: Record<string, string> = {};

    // Build a map of match results for detailed tiebreaker calculation
    const matchResultsMap: Record<string, { home_score: number; away_score: number }> = {};
    for (const match of countableMatches) {
      if (match.home_score !== null && match.away_score !== null) {
        matchResultsMap[match.id] = { home_score: match.home_score, away_score: match.away_score };
      }
    }

    predictions?.forEach(pred => {
      const pid = pred.participant_id;
      pointsMap[pid] = (pointsMap[pid] || 0) + (pred.points_earned || 0);
      
      // Track earliest prediction submission time
      if (!earliestPredictionMap[pid] || 
          new Date(pred.created_at).getTime() < new Date(earliestPredictionMap[pid]).getTime()) {
        earliestPredictionMap[pid] = pred.created_at;
      }

      // Count exact scores and correct results for tiebreaker
      const matchResult = matchResultsMap[pred.match_id];
      if (matchResult) {
        // Exact score
        if (pred.home_score_prediction === matchResult.home_score && 
            pred.away_score_prediction === matchResult.away_score) {
          exactScoresMap[pid] = (exactScoresMap[pid] || 0) + 1;
        }

        // Correct result (win/draw/loss)
        const predResult = pred.home_score_prediction > pred.away_score_prediction ? 'home' : 
                          pred.home_score_prediction < pred.away_score_prediction ? 'away' : 'draw';
        const actualResult = matchResult.home_score > matchResult.away_score ? 'home' : 
                            matchResult.home_score < matchResult.away_score ? 'away' : 'draw';
        if (predResult === actualResult) {
          correctResultsMap[pid] = (correctResultsMap[pid] || 0) + 1;
        }
      }
    });

    // Sort participants by points, then by tiebreaker criteria
    const participantsWithPoints = participants
      .map(p => ({
        ...p,
        total_points: pointsMap[p.id] || 0,
        exact_scores: exactScoresMap[p.id] || 0,
        correct_results: correctResultsMap[p.id] || 0,
        earliest_prediction: earliestPredictionMap[p.id] || p.created_at
      }))
      .sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        
        if (isEstabelecimento) {
          // Estabelecimento tiebreaker: exact scores → correct results → prediction time
          if (b.exact_scores !== a.exact_scores) return b.exact_scores - a.exact_scores;
          if (b.correct_results !== a.correct_results) return b.correct_results - a.correct_results;
        }
        
        // Tiebreaker: earliest prediction submission time wins
        return new Date(a.earliest_prediction).getTime() - new Date(b.earliest_prediction).getTime();
      });

    console.log('Participants with points:', participantsWithPoints);

    // For estabelecimento pools, determine the tiebreaker method used
    let tiebreakerMethod: string | null = null;

    if (isEstabelecimento && participantsWithPoints.length > 1) {
      const topScore = participantsWithPoints[0].total_points;
      const tiedAtTop = participantsWithPoints.filter(p => p.total_points === topScore);

      if (tiedAtTop.length > 1) {
        // Check if exact scores broke the tie
        const topExactScores = tiedAtTop[0].exact_scores;
        const stillTiedAfterExact = tiedAtTop.filter(p => p.exact_scores === topExactScores);

        if (stillTiedAfterExact.length < tiedAtTop.length) {
          tiebreakerMethod = 'exact_scores';
        } else {
          // Check if correct results broke the tie
          const topCorrectResults = stillTiedAfterExact[0].correct_results;
          const stillTiedAfterResults = stillTiedAfterExact.filter(p => p.correct_results === topCorrectResults);

          if (stillTiedAfterResults.length < stillTiedAfterExact.length) {
            tiebreakerMethod = 'total_correct_results';
          } else {
            // Check if prediction time broke the tie
            const topTime = new Date(stillTiedAfterResults[0].earliest_prediction).getTime();
            const stillTiedAfterTime = stillTiedAfterResults.filter(
              p => new Date(p.earliest_prediction).getTime() === topTime
            );

            if (stillTiedAfterTime.length < stillTiedAfterResults.length) {
              tiebreakerMethod = 'prediction_time';
            } else if (stillTiedAfterTime.length > 1) {
              // Random draw needed
              tiebreakerMethod = 'random_draw';
              // Shuffle the tied participants randomly
              for (let i = stillTiedAfterTime.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                // Find these participants in the main array and swap
                const idxI = participantsWithPoints.findIndex(p => p.id === stillTiedAfterTime[i].id);
                const idxJ = participantsWithPoints.findIndex(p => p.id === stillTiedAfterTime[j].id);
                if (idxI >= 0 && idxJ >= 0) {
                  const temp = participantsWithPoints[idxI];
                  participantsWithPoints[idxI] = participantsWithPoints[idxJ];
                  participantsWithPoints[idxJ] = temp;
                }
              }
            }
          }
        }
      }
    }

    // Check if everyone has 0 points (tiebreaker by prediction time applies)
    const allZeroPoints = participantsWithPoints.every(p => p.total_points === 0);

    // Identify top positions considering ties and max_winners
    const maxWinners = pool.max_winners || 3;
    const prizes = [
      pool.first_place_prize ? parseFloat(pool.first_place_prize.toString()) : 0,
      maxWinners >= 2 && pool.second_place_prize ? parseFloat(pool.second_place_prize.toString()) : 0,
      maxWinners >= 3 && pool.third_place_prize ? parseFloat(pool.third_place_prize.toString()) : 0
    ].slice(0, maxWinners);

    const winnersToUpdate: string[] = [];

    if (isEstabelecimento) {
      // For estabelecimento, only 1 winner (max_winners is always 1)
      if (participantsWithPoints.length > 0) {
        winnersToUpdate.push(participantsWithPoints[0].id);
      }
    } else if (allZeroPoints) {
      // When nobody scored, winners are determined by earliest prediction submission time
      const topN = Math.min(maxWinners, participantsWithPoints.length);
      for (let i = 0; i < topN; i++) {
        winnersToUpdate.push(participantsWithPoints[i].id);
      }
      console.log('All participants have 0 points - tiebreaker by prediction submission time applied');
    } else {
      let currentPosition = 0;
      while (currentPosition < participantsWithPoints.length && currentPosition < maxWinners) {
        const currentScore = participantsWithPoints[currentPosition].total_points;
        
        // Skip if score is 0
        if (currentScore === 0) break;

        // Find all participants with the same score (tie group)
        let tieGroupEnd = currentPosition;
        while (
          tieGroupEnd < participantsWithPoints.length &&
          participantsWithPoints[tieGroupEnd].total_points === currentScore
        ) {
          tieGroupEnd++;
        }

        // If this group touches any prize position, they all get a share
        if (currentPosition < maxWinners) {
          for (let i = currentPosition; i < tieGroupEnd; i++) {
            if (participantsWithPoints[i].total_points > 0) {
              winnersToUpdate.push(participantsWithPoints[i].id);
            }
          }
        }

        currentPosition = tieGroupEnd;
      }
    }

    console.log('Winners to update:', winnersToUpdate);

    // Update prize_status for winners who haven't submitted PIX yet
    if (winnersToUpdate.length > 0) {
      const { error: updateError } = await supabaseClient
        .from('participants')
        .update({ prize_status: 'awaiting_pix' })
        .in('id', winnersToUpdate)
        .is('prize_status', null);

      if (updateError) {
        console.error('Error updating winners:', updateError);
        throw updateError;
      }

      console.log(`Updated ${winnersToUpdate.length} winners to awaiting_pix status`);
    }

    // Save tiebreaker method for estabelecimento pools
    if (isEstabelecimento && tiebreakerMethod) {
      await supabaseClient
        .from('pools')
        .update({ tiebreaker_method: tiebreakerMethod })
        .eq('id', pool_id);
      
      console.log(`Tiebreaker method for estabelecimento pool: ${tiebreakerMethod}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        winnersUpdated: winnersToUpdate.length,
        winners: winnersToUpdate,
        tiebreakerApplied: allZeroPoints,
        tiebreakerMethod: tiebreakerMethod,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
