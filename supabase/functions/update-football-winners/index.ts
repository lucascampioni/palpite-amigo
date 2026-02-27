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
      .select('first_place_prize, second_place_prize, third_place_prize, max_winners, prize_type, entry_fee')
      .eq('id', pool_id)
      .single();

    if (poolError) throw poolError;

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
      .select('participant_id, points_earned, created_at')
      .in('participant_id', participantIds);

    if (predictionsError) throw predictionsError;

    // Aggregate points and find earliest prediction time per participant
    const pointsMap: Record<string, number> = {};
    const earliestPredictionMap: Record<string, string> = {};
    predictions?.forEach(pred => {
      pointsMap[pred.participant_id] = (pointsMap[pred.participant_id] || 0) + (pred.points_earned || 0);
      
      // Track earliest prediction submission time
      if (!earliestPredictionMap[pred.participant_id] || 
          new Date(pred.created_at).getTime() < new Date(earliestPredictionMap[pred.participant_id]).getTime()) {
        earliestPredictionMap[pred.participant_id] = pred.created_at;
      }
    });

    // Sort participants by points, then by earliest prediction submission time as tiebreaker
    const participantsWithPoints = participants
      .map(p => ({
        ...p,
        total_points: pointsMap[p.id] || 0,
        earliest_prediction: earliestPredictionMap[p.id] || p.created_at
      }))
      .sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        // Tiebreaker: earliest prediction submission time wins
        return new Date(a.earliest_prediction).getTime() - new Date(b.earliest_prediction).getTime();
      });

    console.log('Participants with points:', participantsWithPoints);

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

    if (allZeroPoints) {
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

    return new Response(
      JSON.stringify({ 
        success: true,
        winnersUpdated: winnersToUpdate.length,
        winners: winnersToUpdate,
        tiebreakerApplied: allZeroPoints
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
