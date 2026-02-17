import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { code } = await req.json();

    if (!code || code.length !== 6) {
      return new Response(JSON.stringify({ error: 'Código inválido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Find matching OTP
    const { data: otpRecord, error: otpError } = await supabaseAdmin
      .from('whatsapp_otp')
      .select('*')
      .eq('user_id', userId)
      .eq('code', code)
      .eq('verified', false)
      .gte('expires_at', new Date().toISOString())
      .maybeSingle();

    if (otpError) {
      console.error('OTP lookup error:', otpError);
      throw new Error('Erro ao verificar código');
    }

    if (!otpRecord) {
      return new Response(
        JSON.stringify({ success: false, error: 'Código inválido ou expirado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark OTP as verified
    await supabaseAdmin.from('whatsapp_otp').update({ verified: true }).eq('id', otpRecord.id);

    // Update profile as phone_verified
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ phone_verified: true })
      .eq('id', userId);

    if (profileError) {
      console.error('Profile update error:', profileError);
      throw new Error('Erro ao atualizar perfil');
    }

    // Cleanup old OTPs for this user
    await supabaseAdmin.from('whatsapp_otp').delete().eq('user_id', userId);

    return new Response(
      JSON.stringify({ success: true, message: 'Telefone verificado com sucesso!' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('verify-whatsapp-otp error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
