// Edge function: webhook do Asaas — confirma pagamento, aprova participante,
// e dispara reembolso automático quando paga sobre QR cancelado/sem palpite ativo.
// Configurar no painel Asaas: URL = https://<project-ref>.supabase.co/functions/v1/asaas-webhook
// Token de autenticação = ASAAS_WEBHOOK_TOKEN (enviado no header asaas-access-token)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

const ASAAS_BASE = "https://api.asaas.com/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;
    const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN");

    // Auth: Asaas envia header "asaas-access-token" com o valor que você cadastrou no painel
    const sentToken = req.headers.get("asaas-access-token");
    if (WEBHOOK_TOKEN && sentToken !== WEBHOOK_TOKEN) {
      console.warn("Webhook token inválido:", sentToken?.slice(0, 6));
      return new Response("Invalid token", { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    console.log("Asaas webhook received:", JSON.stringify(body).slice(0, 1000));

    const event = body.event as string | undefined;
    const payment = body.payment;

    // Eventos relacionados a payouts (transferências) tratamos separadamente
    if (event && event.startsWith("TRANSFER_")) {
      return await handleTransferEvent(body, SUPABASE_URL, SERVICE_ROLE_KEY);
    }

    if (!event || !payment?.id) {
      return new Response(JSON.stringify({ received: true, ignored: true }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Asaas events for incoming PIX:
    // PAYMENT_CREATED, PAYMENT_AWAITING_RISK_ANALYSIS, PAYMENT_APPROVED_BY_RISK_ANALYSIS,
    // PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_OVERDUE, PAYMENT_DELETED, PAYMENT_REFUNDED, etc.
    let localStatus: string;
    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") localStatus = "approved";
    else if (event === "PAYMENT_REFUNDED" || event === "PAYMENT_REFUND_IN_PROGRESS") localStatus = "refunded";
    else if (event === "PAYMENT_DELETED" || event === "PAYMENT_OVERDUE") localStatus = "cancelled";
    else if (event === "PAYMENT_CHARGEBACK_REQUESTED" || event === "PAYMENT_CHARGEBACK_DISPUTE") localStatus = "chargeback";
    else {
      return new Response(JSON.stringify({ received: true, event, ignored: true }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const paymentId = String(payment.id);

    // ===== Reembolso automático em pagamentos sobre QR cancelado =====
    if (localStatus === "approved") {
      const { data: allTxs } = await adminClient
        .from("pool_transactions")
        .select("id, status, participant_id")
        .eq("asaas_payment_id", paymentId);

      let needsRefund = false;
      let reason = "";

      if (!allTxs || allTxs.length === 0) {
        needsRefund = true; reason = "no_transaction_found";
      } else {
        const allCancelled = allTxs.every((t: any) => t.status === "cancelled");
        if (allCancelled) {
          needsRefund = true; reason = "all_transactions_cancelled";
        } else {
          const participantIds = Array.from(new Set(allTxs.map((t: any) => t.participant_id).filter(Boolean)));
          if (participantIds.length === 0) {
            needsRefund = true; reason = "no_participant_linked";
          } else {
            const { data: existingParts } = await adminClient
              .from("participants").select("id").in("id", participantIds);
            const existingIds = new Set((existingParts || []).map((p: any) => p.id));
            const anyAlive = allTxs.some(
              (t: any) => t.status !== "cancelled" && t.participant_id && existingIds.has(t.participant_id)
            );
            if (!anyAlive) { needsRefund = true; reason = "no_active_participant"; }
          }
        }
      }

      if (needsRefund) {
        console.log(`Reembolso automático Asaas ${paymentId} — motivo: ${reason}`);
        try {
          const refundRes = await fetch(`${ASAAS_BASE}/payments/${paymentId}/refund`, {
            method: "POST",
            headers: { "access_token": ASAAS_API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ description: `Auto-refund: ${reason}` }),
          });
          const refundData = await refundRes.json();
          if (!refundRes.ok) {
            console.error(`Falha refund Asaas ${paymentId}:`, refundRes.status, refundData);
          } else {
            await adminClient
              .from("pool_transactions")
              .update({
                status: "refunded",
                raw_response: { payment, refund: refundData, refund_reason: reason },
              })
              .eq("asaas_payment_id", paymentId);
          }
        } catch (err) {
          console.error(`Erro reembolsando Asaas ${paymentId}:`, err);
        }
        return new Response(JSON.stringify({ received: true, status: "refunded", reason }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Update transactions with this Asaas payment id
    const { data: updatedTxs, error: updateTxError } = await adminClient
      .from("pool_transactions")
      .update({
        status: localStatus,
        paid_at: localStatus === "approved" ? new Date().toISOString() : null,
        raw_response: { event, payment },
      })
      .eq("asaas_payment_id", paymentId)
      .neq("status", "cancelled")
      .select("id, participant_id");

    if (updateTxError) console.error("Error updating transactions:", updateTxError);

    if (localStatus === "approved" && updatedTxs && updatedTxs.length > 0) {
      const participantIds = new Set<string>();
      (updatedTxs || []).forEach((t: any) => { if (t.participant_id) participantIds.add(t.participant_id); });
      if (participantIds.size > 0) {
        const { error: approveError } = await adminClient
          .from("participants").update({ status: "approved" }).in("id", Array.from(participantIds));
        if (approveError) console.error("Error approving participants:", approveError);
      }
    }

    return new Response(JSON.stringify({ received: true, status: localStatus }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("asaas-webhook error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

async function handleTransferEvent(body: any, url: string, key: string) {
  const transfer = body.transfer;
  const event = body.event as string;
  if (!transfer?.id) return jsonResp({ received: true, ignored: true }, 200);

  const adminClient = createClient(url, key, { auth: { persistSession: false } });

  let status: string | null = null;
  if (event === "TRANSFER_DONE" || event === "TRANSFER_CONFIRMED") status = "sent";
  else if (event === "TRANSFER_FAILED" || event === "TRANSFER_CANCELLED") status = "failed";
  else if (event === "TRANSFER_IN_BANK_PROCESSING") status = "processing";

  if (!status) return jsonResp({ received: true, event, ignored: true }, 200);

  const update: any = {
    asaas_status: transfer.status || event,
    raw_response: { event, transfer },
  };
  if (status === "sent") {
    update.status = "sent";
    update.sent_at = new Date().toISOString();
  } else if (status === "failed") {
    update.status = "failed";
    update.failure_reason = transfer.failReason || `Asaas event: ${event}`;
  } else {
    update.status = "processing";
  }

  await adminClient.from("pool_payouts").update(update).eq("asaas_transfer_id", String(transfer.id));

  return jsonResp({ received: true, transfer_status: status }, 200);
}

function jsonResp(body: any, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
