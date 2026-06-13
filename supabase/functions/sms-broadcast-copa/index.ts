import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MESSAGE = `⚽ Bora ganhar R$ 500 de graça? Tem um bolão da Copa 100% grátis, sem pegadinha! E o truque pra ganhar é simples: cada amigo que entrar pelo seu link te dá mais uma inscrição extra! Quanto mais você indicar, mais chances de levar o prêmio. 🏆👇 Entra e já pega seu link de indicação: https://delfos.app.br/bolao/bolao-da-copa-100-gratuito Palpites válidos até 18h50BRT.`;

const CAMPAIGN = 'sms_copa_gratuita_2026';
const EXCLUDE = new Set(['12981438598']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === '1';
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam) : undefined;

  // Pull phones (paginate to bypass 1000 row cap)
  const phones: string[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('profiles')
      .select('phone')
      .not('phone', 'is', null)
      .neq('phone', '')
      .range(from, from + pageSize - 1);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    if (!data || data.length === 0) break;
    for (const r of data) {
      const digits = String(r.phone).replace(/\D/g, '');
      if (!/^\d{10,13}$/.test(digits)) continue;
      const normalized = digits.startsWith('55') ? digits.slice(2) : digits;
      if (EXCLUDE.has(normalized)) continue;
      phones.push(normalized);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  const unique = Array.from(new Set(phones));
  const targets = limit ? unique.slice(0, limit) : unique;

  if (dryRun) {
    return new Response(JSON.stringify({ ok: true, dry_run: true, total: targets.length, sample: targets.slice(0, 5) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Find phones already sent for this campaign to skip
  const { data: alreadySent } = await supabase
    .from('whatsapp_send_log')
    .select('phone')
    .eq('message_type', `broadcast_${CAMPAIGN}`)
    .eq('success', true);
  const sentSet = new Set((alreadySent ?? []).map((r: any) => String(r.phone).replace(/\D/g, '')));
  const queue = targets.filter(p => !sentSet.has(p));

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
  const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY')!;
  const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')!;
  const GATEWAY = 'https://connector-gateway.lovable.dev/twilio/Messages.json';

  let sent = 0, failed = 0;
  const errors: Array<{ phone: string; error: string }> = [];

  for (const phone of queue) {
    const to = `+55${phone}`;
    try {
      const res = await fetch(GATEWAY, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': TWILIO_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: MESSAGE }),
      });
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && !data?.error_code && !data?.code;
      const errMsg = ok ? null : (data?.message || data?.error_message || `HTTP ${res.status}`);
      await supabase.from('whatsapp_send_log').insert({
        phone, message_type: `broadcast_${CAMPAIGN}`, success: ok, error: errMsg,
      });
      if (ok) sent++; else { failed++; errors.push({ phone, error: String(errMsg).slice(0, 200) }); }
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ phone, error: msg.slice(0, 200) });
      await supabase.from('whatsapp_send_log').insert({
        phone, message_type: `broadcast_${CAMPAIGN}`, success: false, error: msg,
      });
    }
    // small delay to be gentle on Twilio (~5 msgs/sec)
    await new Promise(r => setTimeout(r, 200));
  }

  return new Response(JSON.stringify({
    ok: true,
    total_targets: targets.length,
    already_sent: targets.length - queue.length,
    attempted: queue.length,
    sent, failed,
    errors: errors.slice(0, 20),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
