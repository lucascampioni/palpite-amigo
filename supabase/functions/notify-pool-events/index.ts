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
      .select('id, title, slug')
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

        const message = `🎯 *Delfos*\n\nOlá ${participant.participant_name}! ⚽🔥\n\nOs palpites do bolão *"${pool.title}"* foram encerrados e os jogos já começaram!\n\nAcesse o app para ver a premiação final, acompanhar os *placares ao vivo* e o *ranking em tempo real*! 📊🏆\n\n👉 ${poolLink}`;

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

      // Send messages
      for (const participant of participants) {
        const phone = phoneMap[participant.user_id];
        if (!phone) continue;

        const message = `🎯 *Delfos*\n\nOlá ${participant.participant_name}! 🏁\n\nO bolão *"${pool.title}"* foi *finalizado* e o ranking final está definido!\n\nAcesse o app para ver a classificação completa e descobrir se você foi o vencedor! 🏆🎉\n\n👉 ${poolLink}`;

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
