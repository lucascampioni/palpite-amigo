// Edge function: calcula splits de um bolão finalizado e cria registros pending_approval
// Pode ser chamada por admin OU automaticamente quando bolão finaliza
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const internalSource = req.headers.get("X-Internal-Source");
    const isInternalCall = internalSource === "update-football-winners" &&
      authHeader === `Bearer ${SERVICE_ROLE_KEY}`;

    if (!isInternalCall) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const { data: isAppAdmin } = await userClient.rpc("is_app_admin");
      const { data: isUserAdmin } = await userClient.rpc("is_user_admin");
      if (!isAppAdmin && !isUserAdmin) {
        return new Response(JSON.stringify({ error: "Acesso negado" }), {
          status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    const { pool_id } = await req.json();
    if (!pool_id) throw new Error("pool_id é obrigatório");

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Get pool
    const { data: pool, error: poolError } = await adminClient
      .from("pools")
      .select("*")
      .eq("id", pool_id)
      .maybeSingle();
    if (poolError || !pool) throw new Error("Bolão não encontrado");
    if (pool.payment_method !== "in_app") throw new Error("Bolão não usa pagamento in-app");

    // Check if payouts already exist
    const { count: existingCount } = await adminClient
      .from("pool_payouts")
      .select("*", { count: "exact", head: true })
      .eq("pool_id", pool_id);
    if ((existingCount || 0) > 0) {
      throw new Error("Repasses já foram criados para este bolão");
    }

    // Sum total collected (only approved transactions)
    const { data: txs } = await adminClient
      .from("pool_transactions")
      .select("amount")
      .eq("pool_id", pool_id)
      .eq("status", "approved");
    const totalCollected = (txs || []).reduce((s, t) => s + Number(t.amount), 0);

    if (totalCollected <= 0) throw new Error("Nenhum pagamento aprovado para este bolão");

    // Get Delfos fee %
    const { data: feeSetting } = await adminClient
      .from("platform_settings")
      .select("value")
      .eq("key", "delfos_fee_percent")
      .maybeSingle();
    const delfosFeePercent = Number(feeSetting?.value || 0);
    const delfosFee = +(totalCollected * delfosFeePercent / 100).toFixed(2);

    // Get winners from ranking
    const { data: ranking } = await adminClient.rpc("get_football_pool_ranking", { p_pool_id: pool_id });
    const sortedRanking = (ranking || []).sort((a: any, b: any) => b.total_points - a.total_points);

    // Determine prize split
    // Percentages (and the implicit organizer share) are calculated over the TOTAL collected,
    // matching what was shown to participants at pool creation. The Delfos fee is a separate
    // deduction from the platform's perspective, NOT from the prize pool.
    const prizeType = pool.prize_type;
    const maxWinners = pool.max_winners || 1;
    const prizes = [pool.first_place_prize, pool.second_place_prize, pool.third_place_prize].slice(0, maxWinners);

    let winnerAmounts: number[] = [];
    if (prizeType === "percentage") {
      winnerAmounts = prizes.map((p: any) => +(totalCollected * Number(p || 0) / 100).toFixed(2));
    } else {
      winnerAmounts = prizes.map((p: any) => Number(p || 0));
    }
    const totalToWinners = winnerAmounts.reduce((s, v) => s + v, 0);
    // Organizer receives whatever is left after Delfos fee + winners
    const organizerAmount = +(totalCollected - delfosFee - totalToWinners).toFixed(2);

    const payouts: any[] = [];

    // Platform (Delfos) payout
    if (delfosFee > 0) {
      payouts.push({
        pool_id,
        recipient_user_id: null,
        recipient_type: "platform",
        amount: delfosFee,
        status: "pending_approval",
        notes: `Taxa Delfos ${delfosFeePercent}% sobre R$ ${totalCollected.toFixed(2)}`,
      });
    }

    // Winners
    for (let i = 0; i < winnerAmounts.length; i++) {
      const amount = winnerAmounts[i];
      if (amount <= 0) continue;
      const winnerEntry = sortedRanking[i];
      if (!winnerEntry) continue;
      const { data: winnerProfile } = await adminClient
        .from("profiles")
        .select("pix_key, pix_key_type")
        .eq("id", winnerEntry.user_id)
        .maybeSingle();
      payouts.push({
        pool_id,
        recipient_user_id: winnerEntry.user_id,
        recipient_type: "winner",
        pix_key: winnerProfile?.pix_key || null,
        pix_key_type: winnerProfile?.pix_key_type || null,
        amount,
        status: "pending_approval",
        notes: `${i + 1}º lugar: ${winnerEntry.participant_name}`,
      });
    }

    // Organizer
    if (organizerAmount > 0) {
      const { data: ownerProfile } = await adminClient
        .from("profiles")
        .select("pix_key, pix_key_type, full_name")
        .eq("id", pool.owner_id)
        .maybeSingle();
      payouts.push({
        pool_id,
        recipient_user_id: pool.owner_id,
        recipient_type: "organizer",
        pix_key: ownerProfile?.pix_key || null,
        pix_key_type: ownerProfile?.pix_key_type || null,
        amount: organizerAmount,
        status: "pending_approval",
        notes: `Comissão organizador (${ownerProfile?.full_name || ""})`,
      });
    }

    if (payouts.length > 0) {
      const { error: insertError } = await adminClient.from("pool_payouts").insert(payouts);
      if (insertError) throw insertError;
    }

    return new Response(JSON.stringify({
      success: true,
      total_collected: totalCollected,
      delfos_fee: delfosFee,
      net_pool: netPool,
      payouts_created: payouts.length,
      payouts,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("mp-process-payouts error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erro inesperado" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
