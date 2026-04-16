// Edge function: webhook do Mercado Pago — confirma pagamento e aprova participante
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

    // We only care about payment notifications
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

    // Update ALL transactions sharing this mp_payment_id (consolidated payment)
    const { data: updatedTxs, error: updateTxError } = await adminClient
      .from("pool_transactions")
      .update({
        status: localStatus,
        paid_at: status === "approved" ? (payment.date_approved || new Date().toISOString()) : null,
        raw_response: payment,
      })
      .eq("mp_payment_id", String(paymentId))
      .select("participant_id");

    if (updateTxError) console.error("Error updating transactions:", updateTxError);

    if (status === "approved") {
      const participantIds = new Set<string>();
      (updatedTxs || []).forEach((t: any) => { if (t.participant_id) participantIds.add(t.participant_id); });
      const metaIds: string[] = payment.metadata?.participant_ids || [];
      metaIds.forEach((id) => participantIds.add(id));
      const single = payment.external_reference || payment.metadata?.participant_id;
      if (single) participantIds.add(single);

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
