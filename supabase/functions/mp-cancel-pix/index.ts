// Edge function: cancela cobranças PIX pendentes (Mercado Pago + banco)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TxRow = {
  id: string;
  mp_payment_id: string | null;
};

const parseJson = (value: string) => {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const fetchPaymentStatus = async (paymentId: string, accessToken: string) => {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await response.text();
  return {
    ok: response.ok,
    data: parseJson(text),
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");

    if (!MP_ACCESS_TOKEN) {
      return new Response(JSON.stringify({ error: "MP_ACCESS_TOKEN não configurado" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = await req.json().catch(() => ({}));
    const transactionId = typeof body.transaction_id === "string" ? body.transaction_id : undefined;
    const participantId = typeof body.participant_id === "string" ? body.participant_id : undefined;
    const poolId = typeof body.pool_id === "string" ? body.pool_id : undefined;
    const transactionIds: string[] = Array.isArray(body.transaction_ids)
      ? body.transaction_ids.filter((id: unknown) => typeof id === "string" && id.length > 0)
      : [];
    const participantIds: string[] = Array.isArray(body.participant_ids)
      ? body.participant_ids.filter((id: unknown) => typeof id === "string" && id.length > 0)
      : [];

    if (!transactionId && !participantId && !poolId && transactionIds.length === 0 && participantIds.length === 0) {
      return new Response(JSON.stringify({ error: "Informe pool_id, participant_id(s) ou transaction_id(s)" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let seedQuery = adminClient
      .from("pool_transactions")
      .select("id, mp_payment_id")
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (transactionId) seedQuery = seedQuery.eq("id", transactionId);
    if (participantId) seedQuery = seedQuery.eq("participant_id", participantId);
    if (poolId) seedQuery = seedQuery.eq("pool_id", poolId);
    if (transactionIds.length > 0) seedQuery = seedQuery.in("id", transactionIds);
    if (participantIds.length > 0) seedQuery = seedQuery.in("participant_id", participantIds);

    const { data: seedTxs, error: seedError } = await seedQuery;
    if (seedError) throw seedError;

    if (!seedTxs || seedTxs.length === 0) {
      return new Response(JSON.stringify({ success: true, cancelled: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const paymentIds = Array.from(
      new Set(seedTxs.map((tx) => tx.mp_payment_id).filter((id): id is string => Boolean(id)))
    );

    let allTxs: TxRow[] = seedTxs;

    if (paymentIds.length > 0) {
      const { data: relatedTxs, error: relatedError } = await adminClient
        .from("pool_transactions")
        .select("id, mp_payment_id")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .in("mp_payment_id", paymentIds);

      if (relatedError) throw relatedError;

      const merged = new Map<string, TxRow>();
      [...seedTxs, ...(relatedTxs || [])].forEach((tx) => merged.set(tx.id, tx));
      allTxs = Array.from(merged.values());
    }

    const successfulPaymentIds: string[] = [];
    const failedPaymentIds: string[] = [];

    for (const paymentId of paymentIds) {
      try {
        const cancelResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "cancelled" }),
        });

        const cancelText = await cancelResponse.text();
        const cancelData = parseJson(cancelText);

        if (!cancelResponse.ok) {
          console.warn(`Falha ao cancelar MP payment ${paymentId}:`, cancelResponse.status, cancelText);
          failedPaymentIds.push(paymentId);
          continue;
        }

        if (cancelData?.status !== "cancelled") {
          const statusCheck = await fetchPaymentStatus(paymentId, MP_ACCESS_TOKEN);
          if (!statusCheck.ok || statusCheck.data?.status !== "cancelled") {
            console.warn(`MP payment ${paymentId} não ficou cancelado após tentativa`, statusCheck.data);
            failedPaymentIds.push(paymentId);
            continue;
          }
        }

        successfulPaymentIds.push(paymentId);
      } catch (error) {
        console.warn(`Erro ao cancelar MP payment ${paymentId}:`, error);
        failedPaymentIds.push(paymentId);
      }
    }

    const rowIdsToCancel = allTxs
      .filter((tx) => !tx.mp_payment_id || successfulPaymentIds.includes(tx.mp_payment_id))
      .map((tx) => tx.id);

    if (rowIdsToCancel.length > 0) {
      const { error: updateError } = await adminClient
        .from("pool_transactions")
        .update({ status: "cancelled" })
        .in("id", rowIdsToCancel);

      if (updateError) throw updateError;
    }

    if (failedPaymentIds.length > 0) {
      return new Response(JSON.stringify({
        error: "Não foi possível invalidar todos os QR Codes pendentes",
        cancelled: rowIdsToCancel.length,
        cancelled_mp_payment_ids: successfulPaymentIds,
        failed_mp_payment_ids: failedPaymentIds,
      }), {
        status: 409,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      cancelled: rowIdsToCancel.length,
      mp_payment_ids: successfulPaymentIds,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("mp-cancel-pix error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erro inesperado" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
