// Edge function: cancela cobranças PIX pendentes (Asaas + banco)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASAAS_BASE = "https://api.asaas.com/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");

    if (!ASAAS_API_KEY) {
      return new Response(JSON.stringify({ error: "ASAAS_API_KEY não configurado" }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

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
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    let seedQuery = adminClient
      .from("pool_transactions")
      .select("id, asaas_payment_id, mp_payment_id")
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
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Group by Asaas payment id (also include rows that have only mp_payment_id from the legacy flow)
    const asaasPaymentIds = Array.from(new Set(
      seedTxs.map((t) => t.asaas_payment_id).filter((v): v is string => Boolean(v))
    ));

    // Fetch related rows sharing same payment ids
    let allTxIds = new Set<string>(seedTxs.map((t) => t.id));
    if (asaasPaymentIds.length > 0) {
      const { data: related } = await adminClient
        .from("pool_transactions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .in("asaas_payment_id", asaasPaymentIds);
      (related || []).forEach((r) => allTxIds.add(r.id));
    }

    const successful: string[] = [];
    const failed: string[] = [];

    for (const paymentId of asaasPaymentIds) {
      try {
        const res = await fetch(`${ASAAS_BASE}/payments/${paymentId}`, {
          method: "DELETE",
          headers: { "access_token": ASAAS_API_KEY, "Content-Type": "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok && !data?.deleted) {
          // If charge was already paid Asaas returns 400. Treat "not found" / "already deleted" as success.
          const msg = data?.errors?.[0]?.description || "";
          if (/já.*pag|paid|received/i.test(msg)) {
            failed.push(paymentId);
            continue;
          }
          if (/n[aã]o encontrad|not found|already/i.test(msg) || res.status === 404) {
            successful.push(paymentId);
            continue;
          }
          console.warn(`Falha ao cancelar Asaas ${paymentId}:`, res.status, data);
          failed.push(paymentId);
          continue;
        }
        successful.push(paymentId);
      } catch (e) {
        console.warn(`Erro cancelando Asaas ${paymentId}:`, e);
        failed.push(paymentId);
      }
    }

    const idsToCancel = Array.from(allTxIds);
    if (idsToCancel.length > 0) {
      await adminClient.from("pool_transactions").update({ status: "cancelled" }).in("id", idsToCancel);
    }

    if (failed.length > 0) {
      return new Response(JSON.stringify({
        error: "Não foi possível invalidar todos os QR Codes pendentes",
        cancelled: idsToCancel.length,
        failed_payment_ids: failed,
      }), { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return new Response(JSON.stringify({
      success: true, cancelled: idsToCancel.length, asaas_payment_ids: successful,
    }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (e: any) {
    console.error("asaas-cancel-pix error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erro inesperado" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
