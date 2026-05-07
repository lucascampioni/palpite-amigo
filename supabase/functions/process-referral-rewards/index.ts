// Edge function: process-referral-rewards
// Quando um indicado é aprovado num bolão elegível, gera N créditos
// (palpites grátis) para o indicador, onde N = número de prediction_sets
// enviados pelo indicado.
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

    const { data: ref } = await supabase
      .from("pool_referrals")
      .select("*")
      .eq("pool_id", pool_id)
      .eq("referred_user_id", referred_user_id)
      .eq("status", "pending")
      .maybeSingle();

    if (!ref) return json({ skipped: "no_pending_referral" }, 200);

    const { data: eligible } = await supabase.rpc("is_pool_referral_eligible", { p_pool_id: pool_id });
    if (!eligible) return json({ skipped: "pool_not_eligible" }, 200);

    // Indicado deve ter participante aprovado
    const { data: referredParts } = await supabase
      .from("participants")
      .select("id")
      .eq("pool_id", pool_id)
      .eq("user_id", referred_user_id)
      .eq("status", "approved")
      .limit(1);
    if (!referredParts || referredParts.length === 0) {
      return json({ skipped: "referred_not_approved" }, 200);
    }

    // Conta nº de prediction_sets distintos enviados pelo indicado neste bolão
    const { data: predRows } = await supabase
      .from("football_predictions")
      .select("prediction_set, participants!inner(pool_id, user_id)")
      .eq("participants.pool_id", pool_id)
      .eq("participants.user_id", referred_user_id);

    const distinctSets = new Set<number>();
    for (const r of (predRows || []) as any[]) {
      if (typeof r.prediction_set === "number") distinctSets.add(r.prediction_set);
    }
    const creditCount = Math.max(1, distinctSets.size);

    // Cria N créditos para o indicador
    const credits = Array.from({ length: creditCount }).map(() => ({
      user_id: ref.referrer_user_id,
      pool_id,
      source_referral_id: ref.id,
    }));

    const { error: credErr } = await supabase.from("referral_credits").insert(credits);
    if (credErr) {
      console.error("Erro criando créditos:", credErr);
      return json({ error: credErr.message }, 500);
    }

    await supabase
      .from("pool_referrals")
      .update({
        status: "rewarded",
        referred_participant_id: referredParts[0].id,
        rewarded_at: new Date().toISOString(),
      })
      .eq("id", ref.id);

    return json({ success: true, credits_created: creditCount }, 200);
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
