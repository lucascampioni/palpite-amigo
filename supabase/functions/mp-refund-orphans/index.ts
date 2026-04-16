// Edge function admin: reembolsa pagamentos aprovados sem palpite ativo (órfãos)
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
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Auth: aceita chamada do cron (com service role no Authorization) OU admin logado
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const isCron = token === SERVICE_ROLE_KEY;

    if (!isCron) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      const { data: isUserAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!isUserAdmin) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    // Busca todas as transações aprovadas cujo participant não existe mais
    const { data: orphans, error: orphansError } = await adminClient
      .from("pool_transactions")
      .select("id, mp_payment_id, amount, participant_id")
      .eq("status", "approved")
      .not("mp_payment_id", "is", null);
    if (orphansError) throw orphansError;

    const participantIds = Array.from(new Set((orphans || []).map((t: any) => t.participant_id).filter(Boolean)));
    let aliveSet = new Set<string>();
    if (participantIds.length > 0) {
      const { data: alive } = await adminClient.from("participants").select("id").in("id", participantIds);
      aliveSet = new Set((alive || []).map((p: any) => p.id));
    }

    const toRefund = (orphans || []).filter((t: any) => !t.participant_id || !aliveSet.has(t.participant_id));
    // Agrupa por mp_payment_id (cada pagamento é reembolsado uma única vez)
    const byPayment = new Map<string, { txIds: string[]; total: number }>();
    for (const t of toRefund) {
      const g = byPayment.get(t.mp_payment_id!) || { txIds: [], total: 0 };
      g.txIds.push(t.id);
      g.total += Number(t.amount || 0);
      byPayment.set(t.mp_payment_id!, g);
    }

    const results: any[] = [];
    for (const [paymentId, group] of byPayment) {
      try {
        const refundResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": `manual-refund-${paymentId}`,
          },
          body: JSON.stringify({}),
        });
        const refundData = await refundResp.json();
        if (!refundResp.ok) {
          // Se já foi reembolsado, MP retorna erro específico — trata como sucesso
          const alreadyRefunded = refundData?.status === 400 && /refunded/i.test(JSON.stringify(refundData));
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
        results.push({ paymentId, ok: true, refundId: refundData?.id, total: group.total, txIds: group.txIds });
      } catch (err: any) {
        results.push({ paymentId, ok: false, error: err.message });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("mp-refund-orphans error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});
