import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { phone, message } = await req.json();
    const digits = String(phone).replace(/\D/g, '');
    const to = digits.startsWith('55') ? `+${digits}` : `+55${digits}`;

    const res = await fetch('https://connector-gateway.lovable.dev/twilio/Messages.json', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
        'X-Connection-Api-Key': Deno.env.get('TWILIO_API_KEY')!,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: to,
        From: Deno.env.get('TWILIO_PHONE_NUMBER')!,
        Body: message ?? 'Delfos: teste de envio via SMS. Se voce recebeu, esta funcionando!',
      }),
    });
    const text = await res.text();
    return new Response(JSON.stringify({ status: res.status, ok: res.ok, to, body: text }), {
      status: res.ok ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
