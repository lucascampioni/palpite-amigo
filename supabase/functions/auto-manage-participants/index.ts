import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();
    const results: { action: string; pool: string; participant: string; success: boolean; error?: string }[] = [];

    // Get all active paid pools
    const { data: pools, error: poolsError } = await supabase
      .from('pools')
      .select('id, title, entry_fee')
      .eq('status', 'active')
      .gt('entry_fee', 0);

    if (poolsError) throw poolsError;
    if (!pools || pools.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active paid pools', results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const poolIds = pools.map(p => p.id);

    // Find earliest match per pool
    const { data: matches, error: matchesError } = await supabase
      .from('football_matches')
      .select('pool_id, match_date')
      .in('pool_id', poolIds)
      .eq('status', 'scheduled')
      .order('match_date', { ascending: true });

    if (matchesError) throw matchesError;

    const earliestMatchByPool: Record<string, string> = {};
    matches?.forEach(m => {
      if (!earliestMatchByPool[m.pool_id]) {
        earliestMatchByPool[m.pool_id] = m.match_date;
      }
    });

    for (const pool of pools) {
      const matchDate = earliestMatchByPool[pool.id];
      if (!matchDate) continue;

      const matchTime = new Date(matchDate);
      const diffMs = matchTime.getTime() - now.getTime();
      const diffMinutes = diffMs / (60 * 1000);

      // AUTO-REJECT: 2h30 before match (150 min) - reject participants without proof
      // Window: 142-157 min (15-min cron window)
      if (diffMinutes >= 142 && diffMinutes <= 157) {
        const { data: pendingNoProof, error: pErr } = await supabase
          .from('participants')
          .select('id, participant_name')
          .eq('pool_id', pool.id)
          .eq('status', 'pending')
          .is('payment_proof', null);

        if (!pErr && pendingNoProof && pendingNoProof.length > 0) {
          const ids = pendingNoProof.map(p => p.id);
          const { error: updateErr } = await supabase
            .from('participants')
            .update({
              status: 'rejected',
              rejection_reason: 'Prazo expirado',
              rejection_details: 'Comprovante de pagamento não enviado dentro do prazo (2h30 antes do jogo).',
            })
            .in('id', ids);

          pendingNoProof.forEach(p => {
            results.push({
              action: 'auto_reject',
              pool: pool.title,
              participant: p.participant_name,
              success: !updateErr,
              error: updateErr?.message,
            });
          });

          if (!updateErr) {
            console.log(`Auto-rejected ${ids.length} participants without proof in pool "${pool.title}"`);
          }
        }
      }

      // AUTO-APPROVE & FINAL REJECT: At match time (0 min) - approve participants with proof, reject all remaining without proof
      // Window: -8 to 8 min (around match start, 15-min cron window)
      if (diffMinutes >= -8 && diffMinutes <= 8) {
        // Reject any remaining pending without proof (definitive rejection)
        const { data: pendingNoProofFinal, error: pErr3 } = await supabase
          .from('participants')
          .select('id, participant_name')
          .eq('pool_id', pool.id)
          .eq('status', 'pending')
          .is('payment_proof', null);

        if (!pErr3 && pendingNoProofFinal && pendingNoProofFinal.length > 0) {
          const ids = pendingNoProofFinal.map(p => p.id);
          const { error: updateErr } = await supabase
            .from('participants')
            .update({
              status: 'rejected',
              rejection_reason: 'Prazo expirado',
              rejection_details: 'Não enviou comprovante de pagamento antes do início dos jogos.',
            })
            .in('id', ids);

          pendingNoProofFinal.forEach(p => {
            results.push({
              action: 'auto_reject_final',
              pool: pool.title,
              participant: p.participant_name,
              success: !updateErr,
              error: updateErr?.message,
            });
          });

          if (!updateErr) {
            console.log(`Final auto-rejected ${ids.length} participants without proof in pool "${pool.title}"`);
          }
        }

        // Auto-approve pending with proof
        const { data: pendingWithProof, error: pErr2 } = await supabase
          .from('participants')
          .select('id, participant_name')
          .eq('pool_id', pool.id)
          .eq('status', 'pending')
          .not('payment_proof', 'is', null);

        if (!pErr2 && pendingWithProof && pendingWithProof.length > 0) {
          const ids = pendingWithProof.map(p => p.id);
          const { error: updateErr } = await supabase
            .from('participants')
            .update({
              status: 'approved',
              rejection_reason: null,
              rejection_details: null,
            })
            .in('id', ids);

          pendingWithProof.forEach(p => {
            results.push({
              action: 'auto_approve',
              pool: pool.title,
              participant: p.participant_name,
              success: !updateErr,
              error: updateErr?.message,
            });
          });

          if (!updateErr) {
            console.log(`Auto-approved ${ids.length} participants with proof in pool "${pool.title}"`);
          }
        }
      }
    }

    console.log(`Auto-manage completed: ${results.length} actions`);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('auto-manage-participants error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
