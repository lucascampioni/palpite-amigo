// Edge function: gera uma cobrança PIX via Mercado Pago
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

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = await req.json();
    const { pool_id, amount } = body;
    // Accept either single participant_id or array participant_ids for consolidated payment
    const participantIds: string[] = Array.isArray(body.participant_ids) && body.participant_ids.length > 0
      ? body.participant_ids
      : (body.participant_id ? [body.participant_id] : []);

    if (!pool_id || participantIds.length === 0 || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "pool_id, participant_id(s) e amount são obrigatórios" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Verify pool uses in-app payment + organizer is allowed
    const { data: pool, error: poolError } = await adminClient
      .from("pools")
      .select("id, title, owner_id, payment_method, entry_fee")
      .eq("id", pool_id)
      .maybeSingle();

    if (poolError || !pool) throw new Error("Bolão não encontrado");
    if (pool.payment_method !== "in_app") throw new Error("Este bolão não aceita pagamento dentro do app");

    const { data: canReceive } = await adminClient.rpc("can_receive_in_app_payments", { _user_id: pool.owner_id });
    if (!canReceive) throw new Error("Organizador não está habilitado para receber pagamentos no app");

    // Verify all participants belong to user
    const { data: participants } = await adminClient
      .from("participants")
      .select("id, user_id, participant_name")
      .in("id", participantIds);
    if (!participants || participants.length !== participantIds.length) throw new Error("Participante(s) inválido(s)");
    if (participants.some((p) => p.user_id !== user.id)) throw new Error("Participante(s) inválido(s)");

    const primaryParticipant = participants[0];

    // Get user email for Mercado Pago
    const { data: authData } = await adminClient.auth.admin.getUserById(user.id);
    const payerEmail = authData?.user?.email || `user-${user.id}@delfos.app.br`;

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

    // Create payment via Mercado Pago API (consolidated for N participants)
    const idempotencyKey = `${primaryParticipant.id}-${participantIds.length}-${Date.now()}`;
    const description = participantIds.length > 1
      ? `Inscrição (${participantIds.length} palpites) - ${pool.title}`
      : `Inscrição - ${pool.title}`;

    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        transaction_amount: Number(amount),
        description,
        payment_method_id: "pix",
        date_of_expiration: expiresAt.toISOString(),
        payer: {
          email: payerEmail,
          first_name: primaryParticipant.participant_name?.split(" ")[0] || "Participante",
        },
        external_reference: primaryParticipant.id,
        notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
        metadata: {
          pool_id,
          participant_id: primaryParticipant.id,
          participant_ids: participantIds,
          user_id: user.id,
        },
      }),
    });

    const mpData = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error("MP API error:", mpData);
      throw new Error(mpData.message || "Erro ao gerar cobrança no Mercado Pago");
    }

    const qrCode = mpData.point_of_interaction?.transaction_data?.qr_code;
    const qrCodeBase64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64;
    const ticketUrl = mpData.point_of_interaction?.transaction_data?.ticket_url;

    // Save one transaction per participant — splits total evenly so sum(pool_transactions) == total paid
    const perParticipantAmount = +(Number(amount) / participantIds.length).toFixed(2);
    const txRows = participantIds.map((pid, idx) => ({
      pool_id,
      participant_id: pid,
      user_id: user.id,
      amount: idx === participantIds.length - 1
        ? +(Number(amount) - perParticipantAmount * (participantIds.length - 1)).toFixed(2)
        : perParticipantAmount,
      mp_payment_id: String(mpData.id),
      mp_qr_code: qrCode,
      mp_qr_code_base64: qrCodeBase64,
      mp_ticket_url: ticketUrl,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      raw_response: mpData,
    }));

    const { data: transactions, error: txError } = await adminClient
      .from("pool_transactions")
      .insert(txRows)
      .select();

    if (txError) throw txError;

    return new Response(JSON.stringify({
      success: true,
      transaction_id: transactions?.[0]?.id,
      transaction_ids: transactions?.map((t) => t.id) || [],
      participant_ids: participantIds,
      mp_payment_id: mpData.id,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      ticket_url: ticketUrl,
      expires_at: expiresAt.toISOString(),
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("mp-create-pix error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erro inesperado" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
