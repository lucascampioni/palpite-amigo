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

    const now = new Date();

    // Windows for 6h and 4h30 reminders before first match
    // Get all pools with upcoming matches that have entry_fee
    const { data: pools, error: poolsError } = await supabase
      .from('pools')
      .select('id, title, entry_fee, deadline')
      .eq('status', 'active')
      .gt('entry_fee', 0);

    if (poolsError) throw poolsError;
    if (!pools || pools.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active paid pools found', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const poolIds = pools.map(p => p.id);

    // Find the earliest match per pool to determine the "game start"
    const { data: matches, error: matchesError } = await supabase
      .from('football_matches')
      .select('pool_id, match_date')
      .in('pool_id', poolIds)
      .eq('status', 'scheduled')
      .order('match_date', { ascending: true });

    if (matchesError) throw matchesError;

    // Group earliest match per pool
    const earliestMatchByPool: Record<string, string> = {};
    matches?.forEach(m => {
      if (!earliestMatchByPool[m.pool_id]) {
        earliestMatchByPool[m.pool_id] = m.match_date;
      }
    });

    const results: { phone: string; pool: string; type: string; success: boolean; error?: string }[] = [];

    for (const pool of pools) {
      const matchDate = earliestMatchByPool[pool.id];
      if (!matchDate) continue;

      const matchTime = new Date(matchDate);
      const diffMs = matchTime.getTime() - now.getTime();
      const diffMinutes = diffMs / (60 * 1000);

      // Determine which reminder window we're in
      let reminderType: '4h30' | '3h' | null = null;

      // 4h30 window: 15-minute range (4h23 to 4h38 = 263-278 min)
      if (diffMinutes >= 263 && diffMinutes <= 278) {
        reminderType = '4h30';
      }
      // 3h window: 15-minute range (2h53 to 3h08 = 173-188 min)
      else if (diffMinutes >= 173 && diffMinutes <= 188) {
        reminderType = '3h';
      }
      if (!reminderType) continue;

      console.log(`Pool "${pool.title}" match in ${Math.round(diffMinutes)}min - sending ${reminderType} reminders`);

      // Get participants with pending payment (no proof uploaded)
      // Status could be 'pending' or 'awaiting_proof' depending on flow
      const { data: participants, error: partError } = await supabase
        .from('participants')
        .select('id, participant_name, user_id')
        .eq('pool_id', pool.id)
        .is('payment_proof', null)
        .in('status', ['pending', 'awaiting_proof']);

      if (partError) {
        console.error(`Error fetching participants for pool ${pool.id}:`, partError);
        continue;
      }

      if (!participants || participants.length === 0) continue;

      // Get phone numbers for these participants
      const userIds = participants.map(p => p.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, phone, notify_pool_updates')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        continue;
      }

      const phoneMap: Record<string, string> = {};
      profiles?.forEach(p => {
        if (p.phone && p.notify_pool_updates) {
          phoneMap[p.id] = p.phone;
        }
      });

      for (const participant of participants) {
        const phone = phoneMap[participant.user_id];
        if (!phone) continue;

        const digits = phone.replace(/\D/g, '');
        const phoneWithCountry = digits.startsWith('55') ? digits : `55${digits}`;

        const timeLeft = reminderType === '4h30' ? '2 horas' : '30 minutos';
        const urgency = reminderType === '3h' ? '🚨 ÚLTIMO AVISO! ' : '⚠️ ';

        const message = `${urgency}⏰ *Pagamento Pendente - ${pool.title}*\n\nOlá ${participant.participant_name}! Você tem apenas *${timeLeft}* para enviar o comprovante de pagamento.\n\n💰 Valor: R$ ${Number(pool.entry_fee).toFixed(2).replace('.', ',')}\n\n⚠️ *IMPORTANTE:* O prazo para envio do comprovante é até *2h30 antes do jogo*. Após esse prazo, sua inscrição será *rejeitada automaticamente*.\n\nEnvie seu comprovante pelo app agora!\n\n🎯 *Delfos*\n\n🔕 _Ajuste suas notificações no site quando quiser._`;

        try {
          const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN;

          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ phone: phoneWithCountry, message }),
          });

          const data = await response.json();
          if (!response.ok) {
            console.error(`Z-API error for ${phoneWithCountry}:`, data);
            results.push({ phone: phoneWithCountry, pool: pool.title, type: reminderType, success: false, error: data?.message });
          } else {
            results.push({ phone: phoneWithCountry, pool: pool.title, type: reminderType, success: true });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          results.push({ phone: phoneWithCountry, pool: pool.title, type: reminderType, success: false, error: errorMsg });
        }

        // Delay between messages
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const sent = results.filter(r => r.success).length;
    console.log(`Reminders sent: ${sent}/${results.length}`);

    return new Response(
      JSON.stringify({ success: true, sent, total: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('send-payment-reminders error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
