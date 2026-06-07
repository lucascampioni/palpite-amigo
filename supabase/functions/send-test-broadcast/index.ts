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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { phone, dryRun } = await req.json().catch(() => ({}));
    if (!phone) throw new Error("phone is required");

    if (dryRun) {
      return new Response(JSON.stringify({ ok: true, message: MESSAGE, phone }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
    const token = Deno.env.get("ZAPI_TOKEN");
    const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");
    if (!instanceId || !token) throw new Error("Z-API creds missing");

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const outcome = await sendWhatsAppThrottled(supabase, {
      instanceId,
      token,
      clientToken: clientToken ?? undefined,
    }, String(phone), MESSAGE, {
      messageType: 'broadcast_copa_gratuita_2026_test',
      respectBusinessHours: true,
    });

    return new Response(JSON.stringify({ ok: outcome.sent, outcome }), {
      status: outcome.sent ? 200 : 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
