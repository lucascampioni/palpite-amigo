// Edge function: calcula splits de um bolão finalizado e cria registros de payout
// já APROVADOS automaticamente, depois invoca asaas-execute-payout para cada um.
// Pode ser chamada por admin OU automaticamente via update-football-winners.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-source",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const internalSource = req.headers.get("X-Internal-Source");
    const isInternalCall = (internalSource === "update-football-winners" || internalSource === "auto-finish")
      && authHeader === `Bearer ${SERVICE_ROLE_KEY}`;

    if (!isInternalCall) {
      if (!authHeader) return jsonResp({ error: "Não autorizado" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return jsonResp({ error: "Não autorizado" }, 401);
      const { data: isAppAdmin } = await userClient.rpc("is_app_admin");
      const { data: isUserAdmin } = await userClient.rpc("is_user_admin");
      if (!isAppAdmin && !isUserAdmin) return jsonResp({ error: "Acesso negado" }, 403);
    }

    const { pool_id, auto_execute } = await req.json();
    if (!pool_id) throw new Error("pool_id é obrigatório");

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: pool, error: poolError } = await adminClient
      .from("pools").select("*").eq("id", pool_id).maybeSingle();
    if (poolError || !pool) throw new Error("Bolão não encontrado");
    if (pool.payment_method !== "in_app") throw new Error("Bolão não usa pagamento in-app");

    const { count: existingCount } = await adminClient
      .from("pool_payouts").select("*", { count: "exact", head: true }).eq("pool_id", pool_id);
    if ((existingCount || 0) > 0) {
      return jsonResp({ success: true, already_processed: true }, 200);
    }

    const { data: txs } = await adminClient
      .from("pool_transactions")
      .select("amount, platform_fee")
      .eq("pool_id", pool_id)
      .eq("status", "approved");
    // totalCollected = soma das ENTRADAS (base), sem a taxa do app.
    // A taxa do app foi cobrada do participante por cima e vai direto para a Delfos.
    const totalCollected = (txs || []).reduce((s, t) => s + Number(t.amount), 0);
    const delfosFee = +((txs || []).reduce((s, t) => s + Number(t.platform_fee || 0), 0)).toFixed(2);
    if (totalCollected <= 0) throw new Error("Nenhum pagamento aprovado para este bolão");

    const { data: ranking } = await adminClient.rpc("get_football_pool_ranking", { p_pool_id: pool_id });
    const sortedRanking = (ranking || []).sort((a: any, b: any) => b.total_points - a.total_points);

    const prizeType = pool.prize_type;
    const maxWinners = pool.max_winners || 1;
    const prizes = [pool.first_place_prize, pool.second_place_prize, pool.third_place_prize].slice(0, maxWinners);

    let winnerAmounts: number[] = [];
    if (prizeType === "percentage") {
      // % calculado em cima da entrada cheia (sem desconto da taxa do app)
      winnerAmounts = prizes.map((p: any) => +(totalCollected * Number(p || 0) / 100).toFixed(2));
    } else {
      // Valor fixo: regra de proteção. Se o arrecadado não cobrir premiação + 25% de margem,
      // a premiação vira 80% do arrecadado dividido proporcionalmente entre os lugares.
      // EXCEÇÃO: bolões com `guaranteed_prize` (criados por admin) sempre pagam o valor fixo cheio,
      // independente do arrecadado — a diferença é coberta pelo app.
      const fixedNumbers = prizes.map((p: any) => Number(p || 0));
      const totalFixed = fixedNumbers.reduce((s, v) => s + v, 0);
      const guaranteeThreshold = totalFixed * 1.25;
      if (!pool.guaranteed_prize && totalFixed > 0 && totalCollected < guaranteeThreshold) {
        const pool80 = totalCollected * 0.8;
        winnerAmounts = fixedNumbers.map((v) =>
          totalFixed > 0 ? +((pool80 * v) / totalFixed).toFixed(2) : 0
        );
      } else {
        winnerAmounts = fixedNumbers;
      }
    }
    const totalToWinners = winnerAmounts.reduce((s, v) => s + v, 0);
    // Organizador recebe o que sobra das ENTRADAS após pagar os vencedores.
    // A taxa do app NÃO entra nessa conta — ela já foi paga pelo participante por cima.
    const organizerAmount = +(totalCollected - totalToWinners).toFixed(2);

    // Always create as pending_approval — admin must explicitly approve in painel
    const initialStatus = "pending_approval";

    const payouts: any[] = [];

    if (delfosFee > 0) {
      payouts.push({
        pool_id, recipient_user_id: null, recipient_type: "platform",
        amount: delfosFee, status: initialStatus,
        notes: `Taxa do app cobrada dos participantes (R$ ${delfosFee.toFixed(2)})`,
      });
    }

    // Detecta grupos de empate e divide igualmente o prêmio das posições cobertas
    // Regra: para empates com pontos > 0, soma os prêmios das posições do grupo
    // que caem dentro do pódio e divide igualmente entre TODAS as entradas empatadas.
    // Para empates com 0 pontos, atribui individualmente por ordem cronológica (já vem ordenado).
    const prizeCount = winnerAmounts.length;
    let i = 0;
    while (i < sortedRanking.length && i < prizeCount) {
      const entry = sortedRanking[i];
      const points = Number(entry.total_points || 0);

      if (points > 0) {
        // Encontra fim do grupo de empate (mesmo número de pontos)
        let end = i;
        while (end < sortedRanking.length && Number(sortedRanking[end].total_points || 0) === points) {
          end++;
        }
        // Soma prêmios das posições deste grupo que estão dentro do pódio
        const prizeEnd = Math.min(end, prizeCount);
        let prizePool = 0;
        for (let k = i; k < prizeEnd; k++) prizePool += winnerAmounts[k];
        const groupSize = end - i;
        const share = groupSize > 0 ? +(prizePool / groupSize).toFixed(2) : 0;

        if (share > 0) {
          for (let k = i; k < end; k++) {
            const winnerEntry = sortedRanking[k];
            const { data: winnerProfile } = await adminClient
              .from("profiles").select("pix_key, pix_key_type").eq("id", winnerEntry.user_id).maybeSingle();
            const positionLabel = groupSize > 1
              ? `Empate ${i + 1}º lugar (${groupSize} ganhadores): ${winnerEntry.participant_name}`
              : `${i + 1}º lugar: ${winnerEntry.participant_name}`;
            payouts.push({
              pool_id, recipient_user_id: winnerEntry.user_id, recipient_type: "winner",
              pix_key: winnerProfile?.pix_key || null,
              pix_key_type: winnerProfile?.pix_key_type || null,
              amount: share, status: initialStatus,
              notes: positionLabel,
            });
          }
        }
        i = end;
      } else {
        // 0 pontos: atribui individualmente por ordem cronológica
        const amount = winnerAmounts[i];
        if (amount > 0) {
          const winnerEntry = sortedRanking[i];
          const { data: winnerProfile } = await adminClient
            .from("profiles").select("pix_key, pix_key_type").eq("id", winnerEntry.user_id).maybeSingle();
          payouts.push({
            pool_id, recipient_user_id: winnerEntry.user_id, recipient_type: "winner",
            pix_key: winnerProfile?.pix_key || null,
            pix_key_type: winnerProfile?.pix_key_type || null,
            amount, status: initialStatus,
            notes: `${i + 1}º lugar: ${winnerEntry.participant_name}`,
          });
        }
        i++;
      }
    }

    // Recalcula totalToWinners pois com empates pode ter mudado (arredondamentos)
    const actualTotalToWinners = payouts
      .filter((p) => p.recipient_type === "winner")
      .reduce((s, p) => s + Number(p.amount), 0);

    if (organizerAmount > 0) {
      const { data: ownerProfile } = await adminClient
        .from("profiles").select("pix_key, pix_key_type, full_name").eq("id", pool.owner_id).maybeSingle();
      payouts.push({
        pool_id, recipient_user_id: pool.owner_id, recipient_type: "organizer",
        pix_key: ownerProfile?.pix_key || null,
        pix_key_type: ownerProfile?.pix_key_type || null,
        amount: organizerAmount, status: initialStatus,
        notes: `Comissão organizador (${ownerProfile?.full_name || ""})`,
      });
    }

    let inserted: any[] = [];
    if (payouts.length > 0) {
      const { data, error: insertError } = await adminClient
        .from("pool_payouts").insert(payouts).select();
      if (insertError) throw insertError;
      inserted = data || [];
    }

    // No auto-execute: payouts wait for manual approval in admin panel
    return jsonResp({
      success: true,
      total_collected: totalCollected,
      delfos_fee: delfosFee,
      total_to_winners: totalToWinners,
      organizer_amount: organizerAmount,
      payouts_created: inserted.length,
      auto_executed: false,
    }, 200);
  } catch (e: any) {
    console.error("asaas-process-payouts error:", e);
    return jsonResp({ error: e.message || "Erro inesperado" }, 500);
  }
});

function jsonResp(body: any, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
