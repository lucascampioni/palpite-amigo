// Edge function: webhook do Mercado Pago — confirma pagamento, aprova participante
// e dispara reembolso automático quando o pagamento corresponde a um palpite cancelado/inexistente
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
    const MP_WEBHOOK_SECRET = Deno.env.get("MP_WEBHOOK_SECRET");

    // Validate webhook signature (Mercado Pago x-signature header)
    if (MP_WEBHOOK_SECRET) {
      const signature = req.headers.get("x-signature");
      const requestId = req.headers.get("x-request-id");
      const url = new URL(req.url);
      const dataId = url.searchParams.get("data.id") || url.searchParams.get("id");

      if (signature && requestId && dataId) {
        const parts = signature.split(",").reduce((acc: Record<string, string>, p) => {
          const [k, v] = p.split("=");
          if (k && v) acc[k.trim()] = v.trim();
          return acc;
        }, {});
        const ts = parts.ts;
        const v1 = parts.v1;
        if (ts && v1) {
          const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
          const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(MP_WEBHOOK_SECRET),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
          );
          const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
          const expected = Array.from(new Uint8Array(sig))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          if (expected !== v1) {
            console.warn("Invalid webhook signature", { expected, v1 });
            return new Response("Invalid signature", { status: 401, headers: corsHeaders });
          }
        }
      }
    }

    const body = await req.json().catch(() => ({}));
    console.log("MP webhook received:", JSON.stringify(body));

    if (body.type !== "payment" && body.topic !== "payment") {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const paymentId = body.data?.id || body.resource?.split("/").pop();
    if (!paymentId) {
      return new Response(JSON.stringify({ error: "no payment id" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch payment details from MP
    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    const payment = await mpResp.json();
    if (!mpResp.ok) {
      console.error("MP fetch error:", payment);
      throw new Error("Erro ao consultar pagamento");
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const status = payment.status;
    const localStatus = status === "approved" ? "approved"
      : status === "rejected" ? "rejected"
      : status === "cancelled" ? "cancelled"
      : status === "refunded" ? "refunded"
      : "pending";

    // ===== Reembolso automático: paid sobre QR cancelado ou sem palpite ativo =====
    if (status === "approved") {
      // Carrega TODAS as transações com este mp_payment_id (inclusive canceladas)
      const { data: allTxs } = await adminClient
        .from("pool_transactions")
        .select("id, status, participant_id")
        .eq("mp_payment_id", String(paymentId));

      let needsRefund = false;
      let reason = "";

      if (!allTxs || allTxs.length === 0) {
        needsRefund = true;
        reason = "no_transaction_found";
      } else {
        const allCancelled = allTxs.every((t: any) => t.status === "cancelled");
        if (allCancelled) {
          needsRefund = true;
          reason = "all_transactions_cancelled";
        } else {
          // Verifica se os participantes ainda existem
          const participantIds = Array.from(
            new Set(allTxs.map((t: any) => t.participant_id).filter(Boolean))
          );
          if (participantIds.length === 0) {
            needsRefund = true;
            reason = "no_participant_linked";
          } else {
            const { data: existingParts } = await adminClient
              .from("participants")
              .select("id")
              .in("id", participantIds);
            const existingIds = new Set((existingParts || []).map((p: any) => p.id));
            const anyAlive = allTxs.some(
              (t: any) => t.status !== "cancelled" && t.participant_id && existingIds.has(t.participant_id)
            );
            if (!anyAlive) {
              needsRefund = true;
              reason = "no_active_participant";
            }
          }
        }
      }

      if (needsRefund) {
        console.log(`Disparando reembolso automático para payment ${paymentId} — motivo: ${reason}`);
        try {
          const refundResp = await fetch(
            `https://api.mercadopago.com/v1/payments/${paymentId}/refunds`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
                "X-Idempotency-Key": `refund-${paymentId}`,
              },
              body: JSON.stringify({}), // sem amount = reembolso total
            },
          );
          const refundData = await refundResp.json();
          if (!refundResp.ok) {
            console.error(`Falha no reembolso ${paymentId}:`, refundResp.status, refundData);
          } else {
            console.log(`Reembolso OK para ${paymentId}:`, refundData?.id);
            // Marca transações como refunded
            if (allTxs && allTxs.length > 0) {
              await adminClient
                .from("pool_transactions")
                .update({
                  status: "refunded",
                  raw_response: { payment, refund: refundData, refund_reason: reason },
                })
                .eq("mp_payment_id", String(paymentId));
            }
          }
        } catch (err) {
          console.error(`Erro ao reembolsar ${paymentId}:`, err);
        }

        return new Response(JSON.stringify({ received: true, status: "refunded", reason }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }
    // ===== fim reembolso automático =====

    // Update ALL non-cancelled transactions sharing this mp_payment_id
    const { data: updatedTxs, error: updateTxError } = await adminClient
      .from("pool_transactions")
      .update({
        status: localStatus,
        paid_at: status === "approved" ? (payment.date_approved || new Date().toISOString()) : null,
        raw_response: payment,
      })
      .eq("mp_payment_id", String(paymentId))
      .neq("status", "cancelled")
      .select("id, participant_id");

    if (updateTxError) console.error("Error updating transactions:", updateTxError);

    if (status === "approved" && updatedTxs && updatedTxs.length > 0) {
      const participantIds = new Set<string>();
      (updatedTxs || []).forEach((t: any) => {
        if (t.participant_id) participantIds.add(t.participant_id);
      });

      if (participantIds.size > 0) {
        const { error: approveError } = await adminClient
          .from("participants")
          .update({ status: "approved" })
          .in("id", Array.from(participantIds));
        if (approveError) console.error("Error approving participants:", approveError);
      }
    }

    return new Response(JSON.stringify({ received: true, status: localStatus }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("mp-webhook error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
