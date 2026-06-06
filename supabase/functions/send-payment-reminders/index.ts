import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { sendWhatsAppThrottled, pickRandom, randomDelayMs, sleep, isWithinBusinessHours } from "../_shared/whatsapp-throttle.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_PER_EXECUTION = 6;

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
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) throw new Error('Z-API credentials not configured');
    const creds = { instanceId: ZAPI_INSTANCE_ID, token: ZAPI_TOKEN, clientToken: ZAPI_CLIENT_TOKEN };

    // Business hours gate — payment reminders are not time-critical, queue for next run.
    if (!isWithinBusinessHours()) {
      console.log('[send-payment-reminders] outside 8h-21h BRT window — skipping run');
      return new Response(JSON.stringify({ message: 'outside business hours', sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const now = new Date();
    const { data: pools, error: poolsError } = await supabase
      .from('pools')
      .select('id, title, entry_fee, deadline, slug')
      .eq('status', 'active')
      .gt('entry_fee', 0);

    if (poolsError) throw poolsError;
    if (!pools || pools.length === 0) {
      return new Response(JSON.stringify({ message: 'No active paid pools found', sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const poolIds = pools.map(p => p.id);
    const { data: matches } = await supabase
      .from('football_matches')
      .select('pool_id, match_date')
      .in('pool_id', poolIds)
      .eq('status', 'scheduled')
      .order('match_date', { ascending: true });

    const earliestMatchByPool: Record<string, string> = {};
    matches?.forEach(m => { if (!earliestMatchByPool[m.pool_id]) earliestMatchByPool[m.pool_id] = m.match_date; });

    const results: any[] = [];
    let sentCount = 0;

    outer: for (const pool of pools) {
      const matchDate = earliestMatchByPool[pool.id];
      if (!matchDate) continue;
      const diffMinutes = (new Date(matchDate).getTime() - now.getTime()) / 60_000;

      let reminderType: '4h30' | '3h' | null = null;
      if (diffMinutes >= 263 && diffMinutes <= 278) reminderType = '4h30';
      else if (diffMinutes >= 173 && diffMinutes <= 188) reminderType = '3h';
      if (!reminderType) continue;

      const { data: participantsRaw } = await supabase
        .from('participants')
        .select('id, participant_name, user_id, participant_financials(payment_proof)')
        .eq('pool_id', pool.id)
        .in('status', ['pending', 'awaiting_proof']);

      const participants = (participantsRaw || []).filter((p: any) => {
        const f = Array.isArray(p.participant_financials) ? p.participant_financials[0] : p.participant_financials;
        return !f?.payment_proof;
      });
      if (!participants.length) continue;

      const userIds = participants.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from('profiles').select('id, phone, notify_pool_updates').in('id', userIds);

      const phoneMap: Record<string, string> = {};
      profiles?.forEach(p => { if (p.phone && p.notify_pool_updates) phoneMap[p.id] = p.phone; });

      for (const participant of participants) {
        const phone = phoneMap[participant.user_id];
        if (!phone) continue;

        const timeLeft = reminderType === '4h30' ? '2 horas' : '30 minutos';
        const poolLink = `https://delfos.app.br/bolao/${pool.slug || pool.id}`;
        const valorStr = Number(pool.entry_fee).toFixed(2).replace('.', ',');
        const urgency = reminderType === '3h' ? '🚨 ÚLTIMO AVISO! ' : '⚠️ ';

        const variants = [
          `${urgency}⏰ *Pagamento Pendente - ${pool.title}*\n\nOlá ${participant.participant_name}! Você tem apenas *${timeLeft}* para enviar o comprovante de pagamento.\n\n💰 Valor: R$ ${valorStr}\n\nApós o prazo, sua inscrição será rejeitada automaticamente.\n\n📲 ${poolLink}\n\n🎯 *Delfos*`,
          `${urgency}Olá ${participant.participant_name}! Faltam *${timeLeft}* para o início do bolão *"${pool.title}"* e ainda não recebemos seu comprovante.\n\nValor: R$ ${valorStr}\n\nGaranta sua vaga: ${poolLink}\n\n— Delfos`,
          `${urgency}⏳ ${participant.participant_name}, sua inscrição em *"${pool.title}"* está pendente.\n\nVocê tem *${timeLeft}* para nos enviar o comprovante (R$ ${valorStr}) antes da rejeição automática.\n\nEnvie aqui 👉 ${poolLink}`,
          `${urgency}Hey ${participant.participant_name}! 👋\n\nO bolão *"${pool.title}"* começa em *${timeLeft}* e seu pagamento (R$ ${valorStr}) ainda não foi confirmado.\n\nNão deixe pra última hora: ${poolLink}\n\nDelfos 🎯`,
        ];
        const message = pickRandom(variants);

        const out = await sendWhatsAppThrottled(supabase, creds, phone, message, { messageType: `payment_reminder_${reminderType}`, respectBusinessHours: true });
        results.push({ phone, pool: pool.title, type: reminderType, ...out });

        if (out.sent) sentCount++;
        if (out.sent === false && (out.reason === 'circuit_open' || out.reason === 'rate_limited' || out.reason === 'outside_hours')) {
          break outer;
        }
        if (sentCount >= MAX_PER_EXECUTION) break outer;

        await sleep(randomDelayMs());
      }
    }

    console.log(`Payment reminders sent: ${sentCount}/${results.length}`);
    return new Response(JSON.stringify({ success: true, sent: sentCount, total: results.length, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('send-payment-reminders error:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
