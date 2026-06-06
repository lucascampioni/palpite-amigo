import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MESSAGE = `⚽🏆 BOLÃO DA COPA — 100% GRÁTIS!

Tá chegando a Copa do Mundo e a gente vai torcer JUNTO! 🇧🇷

🎯 Faça seus palpites nos 10 maiores jogos da fase de grupos, incluindo TODOS os jogos do Brasil!

💰 Prêmio: R$ 500 para o campeão!
🆓 Entrada: 100% grátis, sem pegadinha!

E o melhor: quanto mais amigos você chamar, mais chances você tem de ganhar!
👉 A cada amigo que entrar usando o SEU código de indicação, você ganha mais uma inscrição no bolão — de graça!

⏰ Prazo final para palpitar: 13/06 às 18h50 (horário de Brasília)

Bora garantir sua vaga? 👇
https://delfos.app.br/bolao/bolao-da-copa-100-gratuito

Qualquer dúvida é só responder esta mensagem.
Boa sorte e que vença o melhor palpiteiro! 🍀⚽`;

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

    const digits = String(phone).replace(/\D/g, '');
    const phoneE164 = digits.startsWith('55') ? digits : `55${digits}`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (clientToken) headers['Client-Token'] = clientToken;

    const res = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: phoneE164, message: MESSAGE }),
    });
    const data = await res.json().catch(() => ({}));
    return new Response(JSON.stringify({ ok: res.ok, status: res.status, data }), {
      status: res.ok ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
