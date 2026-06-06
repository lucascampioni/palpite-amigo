import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppThrottled } from "../_shared/whatsapp-throttle.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MESSAGE = `⚽ Bora ganhar R$ 500 de graça?

Tem um bolão da Copa 100% grátis, sem pegadinha! E o truque pra ganhar é simples: cada amigo que entrar pelo seu link te dá mais uma inscrição extra!

Quanto mais você indicar, mais chances de levar o prêmio. 🏆

👇 Entra e já pega seu link de indicação:
https://delfos.app.br/bolao/bolao-da-copa-100-gratuito`;

const CAMPAIGN = 'copa_gratuita_2026';
const MESSAGE_TYPE = `broadcast_${CAMPAIGN}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const creds = {
    instanceId: Deno.env.get('ZAPI_INSTANCE_ID')!,
    token: Deno.env.get('ZAPI_TOKEN')!,
    clientToken: Deno.env.get('ZAPI_CLIENT_TOKEN') ?? undefined,
  };

  try {
    // Pick next pending recipient (FIFO)
    const { data: rows, error: pickErr } = await supabase
      .from('broadcast_queue')
      .select('id, phone')
      .eq('campaign', CAMPAIGN)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);
    if (pickErr) throw pickErr;
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, done: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const row = rows[0];

    // Mark processing to avoid double-send
    const { error: lockErr } = await supabase
      .from('broadcast_queue')
      .update({ status: 'processing', attempted_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending');
    if (lockErr) throw lockErr;

    const outcome = await sendWhatsAppThrottled(
      supabase,
      creds,
      row.phone,
      MESSAGE,
      { messageType: MESSAGE_TYPE, respectBusinessHours: true },
    );

    if (outcome.sent) {
      await supabase
        .from('broadcast_queue')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
        .eq('id', row.id);
      return new Response(JSON.stringify({ ok: true, sent: true, phone: row.phone }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Not sent: requeue unless permanent error from Z-API
    const requeueReasons = ['circuit_open', 'rate_limited', 'outside_hours'];
    const reason = outcome.reason;
    if (requeueReasons.includes(reason)) {
      await supabase
        .from('broadcast_queue')
        .update({ status: 'pending', error: reason })
        .eq('id', row.id);
    } else {
      await supabase
        .from('broadcast_queue')
        .update({ status: 'failed', error: outcome.error ?? reason })
        .eq('id', row.id);
    }
    return new Response(JSON.stringify({ ok: true, sent: false, reason, phone: row.phone }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
