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

    // Check if all matches are finished
    const { data: matches, error: matchesError } = await supabaseClient
      .from('football_matches')
      .select('id, home_score, away_score')
      .eq('pool_id', pool_id);

    if (matchesError) throw matchesError;

    if (!matches || matches.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No matches found for this pool' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allMatchesFinished = matches.every(m => m.home_score !== null && m.away_score !== null);

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
      .select('first_place_prize, second_place_prize, third_place_prize')
      .eq('id', pool_id)
      .single();

    if (poolError) throw poolError;

    // Get all approved participants with their points
    const { data: participants, error: participantsError } = await supabaseClient
      .from('participants')
      .select('id, participant_name, status')
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
      .select('participant_id, points_earned')
      .in('participant_id', participantIds);

    if (predictionsError) throw predictionsError;

    // Aggregate points
    const pointsMap: Record<string, number> = {};
    predictions?.forEach(pred => {
      pointsMap[pred.participant_id] = (pointsMap[pred.participant_id] || 0) + (pred.points_earned || 0);
    });

    // Sort participants by points
    const participantsWithPoints = participants
      .map(p => ({
        ...p,
        total_points: pointsMap[p.id] || 0
      }))
      .sort((a, b) => b.total_points - a.total_points);

    console.log('Participants with points:', participantsWithPoints);

    // Identify top 3 positions considering ties
    const prizes = [
      pool.first_place_prize ? parseFloat(pool.first_place_prize.toString()) : 0,
      pool.second_place_prize ? parseFloat(pool.second_place_prize.toString()) : 0,
      pool.third_place_prize ? parseFloat(pool.third_place_prize.toString()) : 0
    ];

    const winnersToUpdate: string[] = [];
    let currentPosition = 0;

    while (currentPosition < participantsWithPoints.length && currentPosition < 3) {
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

      const tieGroupSize = tieGroupEnd - currentPosition;

      // Calculate how many positions this tie group overlaps with prizes (top 3)
      const prizePositionsEnd = Math.min(tieGroupEnd - 1, 2); // indices 0, 1, 2
      
      // If this group touches any prize position, they all get a share
      if (currentPosition <= 2) {
        for (let i = currentPosition; i < tieGroupEnd; i++) {
          if (participantsWithPoints[i].total_points > 0) {
            winnersToUpdate.push(participantsWithPoints[i].id);
          }
        }
      }

      currentPosition = tieGroupEnd;
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
        winners: winnersToUpdate
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