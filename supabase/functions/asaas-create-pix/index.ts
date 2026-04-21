// Edge function: gera uma cobrança PIX via Asaas
// Substitui mp-create-pix. Mantém o MESMO contrato de resposta para o frontend:
// { transaction_id, transaction_ids, participant_ids, qr_code, qr_code_base64, ticket_url, expires_at }
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASAAS_BASE = "https://api.asaas.com/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const body = await req.json();
    const { pool_id, amount } = body;
    const participantIds: string[] = Array.isArray(body.participant_ids) && body.participant_ids.length > 0
      ? body.participant_ids
      : (body.participant_id ? [body.participant_id] : []);
    const cpfRaw: string = String(body.cpf || "").replace(/\D/g, "");

    if (!pool_id || participantIds.length === 0 || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "pool_id, participant_id(s) e amount são obrigatórios" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (cpfRaw.length !== 11) {
      return new Response(JSON.stringify({ error: "CPF do pagador é obrigatório (11 dígitos)" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Verify pool + organizer eligibility
    const { data: pool, error: poolError } = await adminClient
      .from("pools")
      .select("id, title, owner_id, payment_method, entry_fee")
      .eq("id", pool_id)
      .maybeSingle();
    if (poolError || !pool) throw new Error("Bolão não encontrado");
    if (pool.payment_method !== "in_app") throw new Error("Este bolão não aceita pagamento dentro do app");

    const { data: canReceive } = await adminClient.rpc("can_receive_in_app_payments", { _user_id: pool.owner_id });
    if (!canReceive) throw new Error("Organizador não está habilitado para receber pagamentos no app");

    // Verify participants belong to user
    const { data: participants } = await adminClient
      .from("participants")
      .select("id, user_id, participant_name")
      .in("id", participantIds);
    if (!participants || participants.length !== participantIds.length) throw new Error("Participante(s) inválido(s)");
    if (participants.some((p) => p.user_id !== user.id)) throw new Error("Participante(s) inválido(s)");

    const primaryParticipant = participants[0];

    // ===== Anti-fraude: cancelar cobranças PIX pendentes anteriores =====
    const { data: existingPending } = await adminClient
      .from("pool_transactions")
      .select("id, asaas_payment_id, participant_id, amount, asaas_qr_code, asaas_qr_code_base64, asaas_invoice_url, expires_at")
      .eq("user_id", user.id)
      .eq("pool_id", pool_id)
      .eq("status", "pending");

    const groupedByPayment = new Map<string, { participantIds: string[]; rows: any[] }>();
    for (const row of existingPending || []) {
      if (!row.asaas_payment_id) continue;
      const g = groupedByPayment.get(row.asaas_payment_id) || { participantIds: [], rows: [] };
      if (row.participant_id) g.participantIds.push(row.participant_id);
      g.rows.push(row);
      groupedByPayment.set(row.asaas_payment_id, g);
    }

    // Reuse existing pending QR if exact same participants + amount
    const requestedSet = [...participantIds].sort().join(",");
    for (const [asaasPaymentId, group] of groupedByPayment) {
      const groupSet = [...group.participantIds].sort().join(",");
      const groupTotal = group.rows.reduce((s, r) => s + Number(r.amount), 0);
      const expiresOk = group.rows.every((r) => !r.expires_at || new Date(r.expires_at) > new Date());
      if (groupSet === requestedSet && Math.abs(groupTotal - Number(amount)) < 0.01 && expiresOk) {
        const sample = group.rows[0];
        return new Response(JSON.stringify({
          success: true,
          reused: true,
          transaction_id: sample.id,
          transaction_ids: group.rows.map((r) => r.id),
          participant_ids: participantIds,
          asaas_payment_id: asaasPaymentId,
          qr_code: sample.asaas_qr_code,
          qr_code_base64: sample.asaas_qr_code_base64,
          ticket_url: sample.asaas_invoice_url,
          expires_at: sample.expires_at,
        }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    // Cancel previous Asaas charges
    for (const asaasPaymentId of groupedByPayment.keys()) {
      try {
        const cancelRes = await fetch(`${ASAAS_BASE}/payments/${asaasPaymentId}`, {
          method: "DELETE",
          headers: { "access_token": ASAAS_API_KEY, "Content-Type": "application/json" },
        });
        if (!cancelRes.ok) {
          const errBody = await cancelRes.text();
          console.warn(`Falha ao cancelar Asaas payment ${asaasPaymentId}:`, cancelRes.status, errBody);
        }
      } catch (e) {
        console.warn(`Erro ao cancelar Asaas payment ${asaasPaymentId}:`, e);
      }
    }

    const oldTxIds = (existingPending || []).map((r) => r.id);
    if (oldTxIds.length > 0) {
      // Limpa mp_payment_id/asaas_payment_id para liberar a unique constraint
      // caso o Asaas retorne o mesmo id em uma nova cobrança.
      await adminClient
        .from("pool_transactions")
        .update({
          status: "cancelled",
          mp_payment_id: null,
          asaas_payment_id: null,
        })
        .in("id", oldTxIds);
    }
    // ===== fim anti-fraude =====

    // Get user info to create/find Asaas customer
    const { data: authData } = await adminClient.auth.admin.getUserById(user.id);
    const payerEmail = authData?.user?.email || `user-${user.id}@delfos.app.br`;
    const payerPhone = authData?.user?.phone || null;

    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name, phone, cpf_hash")
      .eq("id", user.id)
      .maybeSingle();

    // Create or get Asaas customer (using user_id as externalReference for idempotency)
    let asaasCustomerId: string | null = null;
    try {
      const findCust = await fetch(
        `${ASAAS_BASE}/customers?externalReference=${encodeURIComponent(user.id)}&limit=1`,
        { headers: { "access_token": ASAAS_API_KEY } },
      );
      const findData = await findCust.json();
      if (findCust.ok && findData?.data?.length > 0) {
        asaasCustomerId = findData.data[0].id;
      }
    } catch (e) {
      console.warn("Erro buscando cliente Asaas:", e);
    }

    const customerPayload = {
      name: profile?.full_name || primaryParticipant.participant_name || "Participante",
      email: payerEmail,
      cpfCnpj: cpfRaw,
      mobilePhone: (profile?.phone || payerPhone || "").replace(/\D/g, "").slice(-11) || undefined,
      externalReference: user.id,
      notificationDisabled: true,
    };

    if (!asaasCustomerId) {
      const createCust = await fetch(`${ASAAS_BASE}/customers`, {
        method: "POST",
        headers: { "access_token": ASAAS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(customerPayload),
      });
      const createData = await createCust.json();
      if (!createCust.ok) {
        console.error("Erro criando cliente Asaas:", createData);
        throw new Error(createData?.errors?.[0]?.description || "Erro ao criar cliente no Asaas");
      }
      asaasCustomerId = createData.id;
    } else {
      // Ensure CPF is set on existing customer (idempotent update)
      try {
        const updRes = await fetch(`${ASAAS_BASE}/customers/${asaasCustomerId}`, {
          method: "POST",
          headers: { "access_token": ASAAS_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify(customerPayload),
        });
        if (!updRes.ok) {
          const updErr = await updRes.json().catch(() => ({}));
          console.warn("Falha ao atualizar cliente Asaas com CPF:", updErr);
        }
      } catch (e) {
        console.warn("Erro atualizando cliente Asaas:", e);
      }
    }

    // Create PIX charge
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min
    const dueDate = expiresAt.toISOString().split("T")[0]; // YYYY-MM-DD
    const description = participantIds.length > 1
      ? `Inscrição (${participantIds.length} palpites) - ${pool.title}`
      : `Inscrição - ${pool.title}`;

    const externalRef = `pool:${pool_id}|user:${user.id}|t:${Date.now()}`;

    const paymentRes = await fetch(`${ASAAS_BASE}/payments`, {
      method: "POST",
      headers: { "access_token": ASAAS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: "PIX",
        value: Number(Number(amount).toFixed(2)),
        dueDate,
        description: description.slice(0, 500),
        externalReference: externalRef.slice(0, 250),
      }),
    });
    const paymentData = await paymentRes.json();
    if (!paymentRes.ok) {
      console.error("Asaas payment error:", paymentData);
      throw new Error(paymentData?.errors?.[0]?.description || "Erro ao gerar cobrança no Asaas");
    }

    // Fetch PIX QR Code
    const qrRes = await fetch(`${ASAAS_BASE}/payments/${paymentData.id}/pixQrCode`, {
      headers: { "access_token": ASAAS_API_KEY },
    });
    const qrData = await qrRes.json();
    if (!qrRes.ok) {
      console.error("Asaas QR error:", qrData);
      throw new Error("Erro ao gerar QR Code PIX");
    }

    const qrCode = qrData.payload; // copia-e-cola
    const qrCodeBase64 = qrData.encodedImage; // base64 PNG (no prefix)
    const ticketUrl = paymentData.invoiceUrl;

    // Save one transaction per participant
    const perParticipantAmount = +(Number(amount) / participantIds.length).toFixed(2);
    const txRows = participantIds.map((pid, idx) => ({
      pool_id,
      participant_id: pid,
      user_id: user.id,
      amount: idx === participantIds.length - 1
        ? +(Number(amount) - perParticipantAmount * (participantIds.length - 1)).toFixed(2)
        : perParticipantAmount,
      asaas_payment_id: String(paymentData.id),
      asaas_qr_code: qrCode,
      asaas_qr_code_base64: qrCodeBase64,
      asaas_invoice_url: ticketUrl,
      // Mirror to legacy mp_* columns so frontend keeps working during transition
      mp_payment_id: String(paymentData.id),
      mp_qr_code: qrCode,
      mp_qr_code_base64: qrCodeBase64,
      mp_ticket_url: ticketUrl,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      raw_response: { payment: paymentData, qr: qrData },
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
      asaas_payment_id: paymentData.id,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      ticket_url: ticketUrl,
      expires_at: expiresAt.toISOString(),
    }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (e: any) {
    console.error("asaas-create-pix error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erro inesperado" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
