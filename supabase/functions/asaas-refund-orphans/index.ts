// Edge function admin/cron: reembolsa pagamentos aprovados sem palpite ativo (órfãos)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-source",
};

const ASAAS_BASE = "https://api.asaas.com/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const isCron = req.headers.get("X-Cron-Source") === "pg_cron" || token === SERVICE_ROLE_KEY;

    if (!isCron) {
      if (!authHeader) return jsonResp({ error: "unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return jsonResp({ error: "unauthorized" }, 401);
      const { data: isUserAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!isUserAdmin) return jsonResp({ error: "forbidden" }, 403);
    }

    const { data: orphans, error: orphansError } = await adminClient
      .from("pool_transactions")
      .select("id, asaas_payment_id, amount, participant_id")
      .eq("status", "approved")
      .not("asaas_payment_id", "is", null);
    if (orphansError) throw orphansError;

    const participantIds = Array.from(new Set((orphans || []).map((t: any) => t.participant_id).filter(Boolean)));
    let aliveSet = new Set<string>();
    if (participantIds.length > 0) {
      const { data: alive } = await adminClient.from("participants").select("id").in("id", participantIds);
      aliveSet = new Set((alive || []).map((p: any) => p.id));
    }

    const toRefund = (orphans || []).filter((t: any) => !t.participant_id || !aliveSet.has(t.participant_id));
    const byPayment = new Map<string, { txIds: string[]; total: number }>();
    for (const t of toRefund) {
      const g = byPayment.get(t.asaas_payment_id!) || { txIds: [], total: 0 };
      g.txIds.push(t.id);
      g.total += Number(t.amount || 0);
      byPayment.set(t.asaas_payment_id!, g);
    }

    const results: any[] = [];
    for (const [paymentId, group] of byPayment) {
      try {
        const refundResp = await fetch(`${ASAAS_BASE}/payments/${paymentId}/refund`, {
          method: "POST",
          headers: { "access_token": ASAAS_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ description: "Backfill: no_active_participant" }),
        });
        const refundData = await refundResp.json();
        if (!refundResp.ok) {
          const alreadyRefunded = /refund/i.test(JSON.stringify(refundData));
          if (!alreadyRefunded) {
            results.push({ paymentId, ok: false, error: refundData });
            continue;
          }
        }
        await adminClient
          .from("pool_transactions")
          .update({
            status: "refunded",
            raw_response: { manual_refund: refundData, refund_reason: "no_active_participant_backfill" },
          })
          .in("id", group.txIds);
        results.push({ paymentId, ok: true, refundId: refundData?.id, total: group.total });
      } catch (err: any) {
        results.push({ paymentId, ok: false, error: err.message });
      }
    }

    return jsonResp({ processed: results.length, results }, 200);
  } catch (e: any) {
    console.error("asaas-refund-orphans error:", e);
    return jsonResp({ error: e.message }, 500);
  }
});

function jsonResp(body: any, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
