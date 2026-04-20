// Edge function: admin aprova um payout — dispara transferência PIX via Mercado Pago
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
    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;

    const authHeader = req.headers.get("Authorization");
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

    const { payout_id, mark_only } = await req.json();
    if (!payout_id) throw new Error("payout_id é obrigatório");

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: payout, error: payoutError } = await adminClient
      .from("pool_payouts")
      .select("*")
      .eq("id", payout_id)
      .maybeSingle();
    if (payoutError || !payout) throw new Error("Payout não encontrado");
    if (payout.status === "sent") throw new Error("Payout já foi enviado");

    // mark_only = só marca como enviado manualmente (admin pagou por fora)
    if (mark_only) {
      const { error: updateError } = await adminClient
        .from("pool_payouts")
        .update({
          status: "sent",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          notes: (payout.notes || "") + " [Marcado como pago manualmente pelo admin]",
        })
        .eq("id", payout_id);
      if (updateError) throw updateError;
      return new Response(JSON.stringify({ success: true, marked_only: true }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Plataforma (Delfos) — não precisa de PIX externo, só registra como enviado
    if (payout.recipient_type === "platform") {
      const { error: updateError } = await adminClient
        .from("pool_payouts")
        .update({
          status: "sent",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          notes: (payout.notes || "") + " [Retido na conta Delfos]",
        })
        .eq("id", payout_id);
      if (updateError) throw updateError;
      return new Response(JSON.stringify({ success: true, platform_retained: true }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!payout.pix_key) throw new Error("Destinatário não tem chave PIX cadastrada");

    // Marca como "processing" antes de chamar a API
    await adminClient
      .from("pool_payouts")
      .update({
        status: "processing",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", payout_id);

    // Tenta executar a transferência PIX via Mercado Pago
    // Endpoint: POST /v1/money_transfers (PIX OUT) — requer permissão "money out" na conta
    const idempotencyKey = `payout-${payout.id}`;
    const transferBody = {
      amount: Number(payout.amount),
      description: payout.notes || `Payout bolão ${payout.pool_id}`,
      external_reference: payout.id,
      payment_method_id: "pix",
      receiver: {
        pix_key: payout.pix_key,
      },
    };

    let mpResponse: Response;
    let mpData: any = null;
    let mpStatus = 0;
    try {
      mpResponse = await fetch("https://api.mercadopago.com/v1/money_transfers", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(transferBody),
      });
      mpStatus = mpResponse.status;
      mpData = await mpResponse.json().catch(() => ({}));
    } catch (fetchErr: any) {
      await adminClient
        .from("pool_payouts")
        .update({
          status: "failed",
          failure_reason: `Erro de rede: ${fetchErr.message}`,
          raw_response: { error: fetchErr.message },
        })
        .eq("id", payout_id);
      throw new Error(`Falha de rede ao chamar Mercado Pago: ${fetchErr.message}`);
    }

    console.log("MP transfer response:", mpStatus, JSON.stringify(mpData));

    // Se a conta MP não tem permissão de "money out", retornamos erro claro
    if (mpStatus >= 400) {
      const reason = mpData?.message || mpData?.error || `HTTP ${mpStatus}`;
      const isMoneyOutDisabled = mpStatus === 403 || mpStatus === 404 ||
        /money.?out|not.?found|forbidden|permission/i.test(reason);

      await adminClient
        .from("pool_payouts")
        .update({
          status: isMoneyOutDisabled ? "approved" : "failed",
          failure_reason: isMoneyOutDisabled
            ? "Conta Mercado Pago não oferece PIX OUT nesta conta. Faça a transferência manualmente e depois marque como enviado."
            : `Mercado Pago: ${reason}`,
          raw_response: mpData,
        })
        .eq("id", payout_id);

      return new Response(JSON.stringify({
        success: false,
        error: isMoneyOutDisabled
          ? "PIX OUT não habilitado na conta Mercado Pago. Faça a transferência manualmente e use 'Marcar como pago'."
          : `Falha ao executar transferência: ${reason}`,
        mp_status: mpStatus,
        mp_response: mpData,
      }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Sucesso — marca como enviado
    const { error: updateError } = await adminClient
      .from("pool_payouts")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        mp_transfer_id: mpData?.id?.toString() || null,
        raw_response: mpData,
      })
      .eq("id", payout_id);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({
      success: true,
      mp_transfer_id: mpData?.id,
      message: "Transferência PIX executada com sucesso via Mercado Pago.",
    }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("mp-execute-payout error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erro inesperado" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
