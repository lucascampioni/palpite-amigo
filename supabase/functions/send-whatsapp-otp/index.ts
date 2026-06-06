import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sendWhatsAppThrottled,
  pickRandom,
} from "../_shared/whatsapp-throttle.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userId = claimsData.claims.sub;
    const { phone } = await req.json();

    if (!phone) {
      return new Response(JSON.stringify({ error: 'Telefone é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const digits = phone.replace(/\D/g, '');
    const phoneWithCountry = digits.startsWith('55') ? digits : `55${digits}`;

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    await supabaseAdmin.from('whatsapp_otp').delete().eq('user_id', userId);

    const { error: insertError } = await supabaseAdmin.from('whatsapp_otp').insert({
      phone: phoneWithCountry,
      code,
      user_id: userId,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error('Error inserting OTP:', insertError);
      throw new Error('Erro ao gerar código de verificação');
    }

    const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
    const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
    const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN');
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) throw new Error('Z-API credentials not configured');

    // OTP message variations (user is actively waiting — bypass throttle)
    const variants = [
      `🔐 Código Delfos: *${code}*\n\nUse este código para verificar seu WhatsApp. Expira em 10 min.\n\n⚠️ Não compartilhe com ninguém.`,
      `🔐 Seu código de verificação Delfos é *${code}*.\n\nVálido por 10 minutos. Não repasse para ninguém.`,
      `Delfos 🔐\n\nCódigo: *${code}*\nExpira em 10 minutos.\n\nUso pessoal — não compartilhe.`,
      `🔐 *${code}* é o seu código de acesso Delfos.\n\nUse nos próximos 10 minutos. Mantenha em sigilo.`,
    ];
    const message = pickRandom(variants);

    const outcome = await sendWhatsAppThrottled(
      supabaseAdmin,
      { instanceId: ZAPI_INSTANCE_ID, token: ZAPI_TOKEN, clientToken: ZAPI_CLIENT_TOKEN },
      phoneWithCountry,
      message,
      { messageType: 'otp', bypassThrottle: true },
    );

    if (!outcome.sent) throw new Error('Erro ao enviar código via WhatsApp');

    return new Response(
      JSON.stringify({ success: true, message: 'Código enviado via WhatsApp' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('send-whatsapp-otp error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
