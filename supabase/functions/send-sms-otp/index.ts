import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';

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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
    if (!TWILIO_API_KEY) throw new Error('TWILIO_API_KEY is not configured');

    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');
    if (!TWILIO_PHONE_NUMBER) throw new Error('TWILIO_PHONE_NUMBER is not configured');

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
    const phoneWithCountry = digits.startsWith('55') ? `+${digits}` : `+55${digits}`;

    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Delete previous OTPs for this user
    await supabaseAdmin.from('whatsapp_otp').delete().eq('user_id', userId);

    // Insert new OTP
    const phoneForDb = digits.startsWith('55') ? digits : `55${digits}`;
    const { error: insertError } = await supabaseAdmin.from('whatsapp_otp').insert({
      phone: phoneForDb,
      code,
      user_id: userId,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error('Error inserting OTP:', insertError);
      throw new Error('Erro ao gerar código de verificação');
    }

    // Send via Twilio SMS through gateway
    const message = `Código Delfos: ${code}. Use este código para verificar seu telefone. Expira em 10 min. Não compartilhe com ninguém.`;

    const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phoneWithCountry,
        From: TWILIO_PHONE_NUMBER,
        Body: message,
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Twilio API error:', responseData);
      throw new Error(`Erro ao enviar SMS: ${responseData?.message || response.status}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Código enviado via SMS' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('send-sms-otp error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
