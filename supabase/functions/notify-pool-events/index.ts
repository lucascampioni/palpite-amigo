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

    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
      throw new Error('Z-API credentials not configured');
    }

    const results: { type: string; pool: string; phone: string; success: boolean; error?: string }[] = [];

    // ═══════════════════════════════════════════════════════════════
    // 1. FIRST MATCH STARTED - notify participants when first match kicks off
    // ═══════════════════════════════════════════════════════════════
    
    // Find active pools that haven't sent first_match notification yet
    const { data: activePoolsNotNotified, error: poolsErr } = await supabase
      .from('pools')
      .select('id, title, slug, entry_fee, prize_type, first_place_prize, second_place_prize, third_place_prize')
      .eq('pool_type', 'football')
      .eq('status', 'active')
      .eq('first_match_notified', false);

    if (poolsErr) throw poolsErr;

    for (const pool of activePoolsNotNotified || []) {
      // Check if any match in this pool has started (status is live)
      const { data: liveMatches } = await supabase
        .from('football_matches')
        .select('id, status')
        .eq('pool_id', pool.id)
        .in('status', ['1H', '2H', 'HT', 'ET', 'P']);

      if (!liveMatches || liveMatches.length === 0) continue;

      console.log(`⚽ First match started for pool "${pool.title}" - sending notifications`);

      // Calculate prize text
      const prizeText = await buildPrizeText(supabase, pool);
      const poolLink = `https://delfos.app.br/bolao/${pool.slug || pool.id}`;

      // Get approved participants
      const { data: participants } = await supabase
        .from('participants')
        .select('user_id, participant_name')
        .eq('pool_id', pool.id)
        .eq('status', 'approved');

      if (!participants || participants.length === 0) {
        // Mark as notified even if no participants
        await supabase.from('pools').update({ first_match_notified: true }).eq('id', pool.id);
        continue;
      }

      // Get phones (only those who opted in to pool updates)
      const userIds = participants.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, phone, notify_pool_updates')
        .in('id', userIds);

      const phoneMap: Record<string, string> = {};
      profiles?.forEach(p => {
        if (p.phone && p.notify_pool_updates) {
          phoneMap[p.id] = p.phone;
        }
      });

      // Send messages
      for (const participant of participants) {
        const phone = phoneMap[participant.user_id];
        if (!phone) continue;

        const message = `🎯 *Delfos*\n\n⚽🔥 Olá ${participant.participant_name}!\n\nOs jogos do bolão *"${pool.title}"* começaram e a premiação final foi definida!${prizeText}\n\n📊 Acompanhe os *placares ao vivo* e o *ranking em tempo real* pelo app!\n\n👉 ${poolLink}`;

        const sendResult = await sendWhatsApp(ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, phone, message);
        results.push({ type: 'first_match_started', pool: pool.title, phone, ...sendResult });

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Mark pool as notified
      await supabase.from('pools').update({ first_match_notified: true }).eq('id', pool.id);
      console.log(`✅ First match notifications sent for pool "${pool.title}"`);
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. POOL FINISHED - notify participants when ranking is final
    // ═══════════════════════════════════════════════════════════════

    // Find finished pools that haven't sent finished notification yet
    const { data: finishedPoolsNotNotified, error: finPoolsErr } = await supabase
      .from('pools')
      .select('id, title, slug')
      .eq('pool_type', 'football')
      .eq('status', 'finished')
      .eq('finished_notified', false);

    if (finPoolsErr) throw finPoolsErr;

    for (const pool of finishedPoolsNotNotified || []) {
      console.log(`🏆 Pool "${pool.title}" finished - sending final notifications`);

      const poolLink = `https://delfos.app.br/bolao/${pool.slug || pool.id}`;

      // Get ranking
      const { data: ranking } = await supabase.rpc('get_football_pool_ranking', { p_pool_id: pool.id });

      // Get approved participants
      const { data: participants } = await supabase
        .from('participants')
        .select('id, user_id, participant_name')
        .eq('pool_id', pool.id)
        .eq('status', 'approved');

      if (!participants || participants.length === 0) {
        await supabase.from('pools').update({ finished_notified: true }).eq('id', pool.id);
        continue;
      }

      // Get phones
      const userIds = participants.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, phone, notify_pool_updates')
        .in('id', userIds);

      const phoneMap: Record<string, string> = {};
      profiles?.forEach(p => {
        if (p.phone && p.notify_pool_updates) {
          phoneMap[p.id] = p.phone;
        }
      });

      // Build participant ranking map
      const rankMap: Record<string, { position: number; points: number }> = {};
      ranking?.forEach((r: any, idx: number) => {
        // Ranking may have multiple prediction sets; take best position for each participant
        if (!rankMap[r.participant_id] || r.total_points > rankMap[r.participant_id].points) {
          rankMap[r.participant_id] = { position: idx + 1, points: r.total_points };
        }
      });

      // Determine top 3 for winner check
      const topParticipantIds = new Set<string>();
      const sortedRanking = [...(ranking || [])];
      // Deduplicate by participant (take highest points per participant)
      const bestByParticipant: Record<string, number> = {};
      sortedRanking.forEach((r: any) => {
        if (!bestByParticipant[r.participant_id] || r.total_points > bestByParticipant[r.participant_id]) {
          bestByParticipant[r.participant_id] = r.total_points;
        }
      });
      const sortedParticipants = Object.entries(bestByParticipant)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);
      sortedParticipants.forEach(([pid]) => topParticipantIds.add(pid));

      // Send messages
      for (const participant of participants) {
        const phone = phoneMap[participant.user_id];
        if (!phone) continue;

        const rank = rankMap[participant.id];
        const isWinner = topParticipantIds.has(participant.id);
        const positionText = rank ? `\n\n📊 Você ficou na *${rank.position}ª posição* com *${rank.points} pontos*.` : '';

        let winnerText = '';
        if (isWinner && rank?.position === 1) {
          winnerText = '\n\n🥇 *PARABÉNS! Você foi o CAMPEÃO!* 🎉🏆';
        } else if (isWinner) {
          winnerText = `\n\n🏅 *Parabéns! Você ficou no TOP ${rank?.position}!* 🎉`;
        }

        const message = `🎯 *Delfos*\n\nOlá ${participant.participant_name}! 🏁\n\nO bolão *"${pool.title}"* foi *finalizado* e o ranking final está definido!${positionText}${winnerText}\n\nAcesse o app para ver a classificação completa! 🏆\n\n👉 ${poolLink}`;

        const sendResult = await sendWhatsApp(ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, phone, message);
        results.push({ type: 'pool_finished', pool: pool.title, phone, ...sendResult });

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Mark pool as notified
      await supabase.from('pools').update({ finished_notified: true }).eq('id', pool.id);
      console.log(`✅ Finished notifications sent for pool "${pool.title}"`);
    }

    const sent = results.filter(r => r.success).length;
    console.log(`📨 Pool event notifications: ${sent}/${results.length} sent`);

    return new Response(
      JSON.stringify({ success: true, sent, total: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('notify-pool-events error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function buildPrizeText(supabase: any, pool: any): Promise<string> {
  if (!pool.first_place_prize) return '';

  if (pool.prize_type === 'percentage') {
    // Calculate actual values from approved participants
    const { count } = await supabase
      .from('participants')
      .select('id', { count: 'exact', head: true })
      .eq('pool_id', pool.id)
      .eq('status', 'approved');

    const total = (pool.entry_fee || 0) * (count || 0);
    if (total <= 0) return '';

    const formatPrize = (pct: number) => {
      const value = (total * pct / 100).toFixed(2).replace('.', ',');
      return `R$ ${value}`;
    };

    return `\n\n💰 *Premiação final:*\n🥇 1º lugar: ${formatPrize(pool.first_place_prize)}${pool.second_place_prize ? `\n🥈 2º lugar: ${formatPrize(pool.second_place_prize)}` : ''}${pool.third_place_prize ? `\n🥉 3º lugar: ${formatPrize(pool.third_place_prize)}` : ''}`;
  }

  return `\n\n💰 *Premiação:*\n🥇 1º lugar: R$ ${Number(pool.first_place_prize).toFixed(2).replace('.', ',')}${pool.second_place_prize ? `\n🥈 2º lugar: R$ ${Number(pool.second_place_prize).toFixed(2).replace('.', ',')}` : ''}${pool.third_place_prize ? `\n🥉 3º lugar: R$ ${Number(pool.third_place_prize).toFixed(2).replace('.', ',')}` : ''}`;
}

async function sendWhatsApp(
  instanceId: string,
  token: string,
  clientToken: string | undefined,
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const digits = phone.replace(/\D/g, '');
  const phoneWithCountry = digits.startsWith('55') ? digits : `55${digits}`;

  try {
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (clientToken) headers['Client-Token'] = clientToken;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: phoneWithCountry, message }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`Z-API error for ${phoneWithCountry}:`, data);
      return { success: false, error: data?.message || `HTTP ${response.status}` };
    }
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: errorMsg };
  }
}
