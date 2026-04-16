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

    if (!payout.pix_key) throw new Error("Destinatário não tem chave PIX cadastrada");

    // NOTE: Mercado Pago API for PIX payouts requires "money out" / "withdraw" capabilities
    // which need to be enabled on the merchant account. The endpoint below is a placeholder
    // representing the integration point; for now we mark the payout as 'approved' and let
    // admin manually execute the transfer. Once MP enables PIX payouts on the account,
    // this can be wired to /v1/payouts or similar.

    // For now: mark as approved (next step: admin disparará transferência manualmente ou via produto MP)
    const { error: updateError } = await adminClient
      .from("pool_payouts")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", payout_id);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({
      success: true,
      message: "Payout aprovado. Transferência PIX deve ser executada manualmente via painel Mercado Pago até que a API de payouts esteja habilitada na conta.",
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
