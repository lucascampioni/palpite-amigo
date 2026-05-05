// Edge function: process-referral-rewards
// Verifica se um indicado aprovado dispara recompensa de palpite grátis para o indicador
// num bolão elegível (premiação fixa + comunidade Delfos Oficial).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const { pool_id, referred_user_id } = body || {};
    if (!pool_id || !referred_user_id) {
      return json({ error: "missing pool_id or referred_user_id" }, 400);
    }

    // Buscar referral pendente
    const { data: ref } = await supabase
      .from("pool_referrals")
      .select("*")
      .eq("pool_id", pool_id)
      .eq("referred_user_id", referred_user_id)
      .eq("status", "pending")
      .maybeSingle();

    if (!ref) return json({ skipped: "no_pending_referral" }, 200);

    // Confirmar elegibilidade do bolão
    const { data: eligible } = await supabase.rpc("is_pool_referral_eligible", { p_pool_id: pool_id });
    if (!eligible) return json({ skipped: "pool_not_eligible" }, 200);

    // Confirmar que indicado tem participante aprovado
    const { data: referredParts } = await supabase
      .from("participants")
      .select("id, status")
      .eq("pool_id", pool_id)
      .eq("user_id", referred_user_id)
      .eq("status", "approved")
      .limit(1);
    if (!referredParts || referredParts.length === 0) {
      return json({ skipped: "referred_not_approved" }, 200);
    }

    // Confirmar que o indicador também é participante aprovado
    const { data: referrerParts } = await supabase
      .from("participants")
      .select("id, status")
      .eq("pool_id", pool_id)
      .eq("user_id", ref.referrer_user_id)
      .eq("status", "approved")
      .limit(1);
    if (!referrerParts || referrerParts.length === 0) {
      return json({ skipped: "referrer_not_approved" }, 200);
    }

    // Buscar nome do indicador
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", ref.referrer_user_id)
      .single();

    // Criar nova entrada gratuita aprovada para o indicador
    const { data: newPart, error: insErr } = await supabase
      .from("participants")
      .insert({
        pool_id,
        user_id: ref.referrer_user_id,
        participant_name: profile?.full_name || "Participante",
        guess_value: "Indicação grátis",
        status: "approved",
        payment_proof: `referral_reward:${referred_user_id}`,
      })
      .select()
      .single();

    if (insErr || !newPart) {
      console.error("Erro criando recompensa:", insErr);
      return json({ error: insErr?.message || "insert_failed" }, 500);
    }

    await supabase
      .from("pool_referrals")
      .update({
        status: "rewarded",
        reward_participant_id: newPart.id,
        referred_participant_id: referredParts[0].id,
        rewarded_at: new Date().toISOString(),
      })
      .eq("id", ref.id);

    return json({ success: true, reward_participant_id: newPart.id }, 200);
  } catch (e: any) {
    console.error("process-referral-rewards error:", e);
    return json({ error: e.message }, 500);
  }
});

function json(body: any, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
