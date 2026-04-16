// Edge function: cancela uma cobrança PIX pendente (Mercado Pago + banco)
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
    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");

    if (!MP_ACCESS_TOKEN) {
      return new Response(JSON.stringify({ error: "MP_ACCESS_TOKEN não configurado" }), {
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
    const { transaction_id, pool_id } = body as { transaction_id?: string; pool_id?: string };

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Find pending transactions belonging to this user
    let query = adminClient
      .from("pool_transactions")
      .select("id, mp_payment_id, user_id, pool_id, status")
      .eq("user_id", user.id)
      .eq("status", "pending");
    if (transaction_id) query = query.eq("id", transaction_id);
    if (pool_id) query = query.eq("pool_id", pool_id);

    const { data: txs, error: txErr } = await query;
    if (txErr) throw txErr;
    if (!txs || txs.length === 0) {
      return new Response(JSON.stringify({ success: true, cancelled: 0 }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Group by mp_payment_id
    const paymentIds = new Set<string>();
    txs.forEach((t) => { if (t.mp_payment_id) paymentIds.add(t.mp_payment_id); });

    // Cancel at Mercado Pago
    for (const pid of paymentIds) {
      try {
        const r = await fetch(`https://api.mercadopago.com/v1/payments/${pid}`, {
          method: "PUT",
          headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        });
        if (!r.ok) {
          const t = await r.text();
          console.warn(`Falha ao cancelar MP payment ${pid}:`, r.status, t);
        }
      } catch (e) {
        console.warn(`Erro ao cancelar MP payment ${pid}:`, e);
      }
    }

    const ids = txs.map((t) => t.id);
    await adminClient.from("pool_transactions").update({ status: "cancelled" }).in("id", ids);

    return new Response(JSON.stringify({ success: true, cancelled: ids.length, mp_payment_ids: Array.from(paymentIds) }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("mp-cancel-pix error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erro inesperado" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
