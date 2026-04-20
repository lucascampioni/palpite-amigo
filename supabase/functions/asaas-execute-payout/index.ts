// Edge function: executa um payout via Asaas Transfer API (PIX OUT)
// Pode ser chamada manualmente pelo admin ou automaticamente após bolão finalizar.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-source",
};

const ASAAS_BASE = "https://api.asaas.com/v3";

const detectPixKeyType = (key: string, declared?: string | null): string => {
  // Asaas accepts: CPF | CNPJ | EMAIL | PHONE | EVP
  if (declared) {
    const d = declared.toUpperCase();
    if (d === "CPF" || d === "CNPJ" || d === "EMAIL" || d === "PHONE" || d === "EVP") return d;
    if (d === "TELEFONE") return "PHONE";
    if (d === "ALEATORIA" || d === "ALEATÓRIA" || d === "RANDOM") return "EVP";
  }
  const onlyDigits = key.replace(/\D/g, "");
  if (key.includes("@")) return "EMAIL";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return "EVP";
  if (onlyDigits.length === 11) return "CPF";
  if (onlyDigits.length === 14) return "CNPJ";
  if (onlyDigits.length === 13 || onlyDigits.length === 12 || onlyDigits.length === 10) return "PHONE";
  return "EVP";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const internalSource = req.headers.get("X-Internal-Source");
    const isInternalCall = (internalSource === "auto-finish" || internalSource === "update-football-winners")
      && authHeader === `Bearer ${SERVICE_ROLE_KEY}`;

    if (!isInternalCall) {
      if (!authHeader) return jsonResp({ error: "Não autorizado" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return jsonResp({ error: "Não autorizado" }, 401);
      const { data: isAppAdmin } = await userClient.rpc("is_app_admin");
      const { data: isUserAdmin } = await userClient.rpc("is_user_admin");
      if (!isAppAdmin && !isUserAdmin) return jsonResp({ error: "Acesso negado" }, 403);
    }

    const { payout_id, mark_only } = await req.json();
    if (!payout_id) throw new Error("payout_id é obrigatório");

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: payout, error: payoutError } = await adminClient
      .from("pool_payouts").select("*").eq("id", payout_id).maybeSingle();
    if (payoutError || !payout) throw new Error("Payout não encontrado");
    if (payout.status === "sent") throw new Error("Payout já foi enviado");

    const approverUserId = isInternalCall ? null : (await getUserId(req, SUPABASE_URL, ANON_KEY));

    if (mark_only) {
      const { error } = await adminClient.from("pool_payouts").update({
        status: "sent",
        approved_by: approverUserId,
        approved_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        notes: (payout.notes || "") + " [Marcado como pago manualmente]",
      }).eq("id", payout_id);
      if (error) throw error;
      return jsonResp({ success: true, marked_only: true }, 200);
    }

    // Plataforma (Delfos) — fica retido na conta Asaas, sem transferência
    if (payout.recipient_type === "platform") {
      const { error } = await adminClient.from("pool_payouts").update({
        status: "sent",
        approved_by: approverUserId,
        approved_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        notes: (payout.notes || "") + " [Retido na conta Delfos/Asaas]",
      }).eq("id", payout_id);
      if (error) throw error;
      return jsonResp({ success: true, platform_retained: true }, 200);
    }

    if (!payout.pix_key) throw new Error("Destinatário não tem chave PIX cadastrada");

    // Marca como processing
    await adminClient.from("pool_payouts").update({
      status: "processing",
      approved_by: approverUserId,
      approved_at: new Date().toISOString(),
    }).eq("id", payout_id);

    // Asaas Transfer API: POST /v3/transfers
    const pixAddressKeyType = detectPixKeyType(payout.pix_key, payout.pix_key_type);
    const transferBody = {
      value: Number(payout.amount),
      operationType: "PIX",
      pixAddressKey: payout.pix_key,
      pixAddressKeyType,
      description: (payout.notes || `Premiação bolão ${payout.pool_id}`).slice(0, 100),
      externalReference: `payout-${payout.id}`.slice(0, 64),
    };

    let res: Response;
    let data: any = null;
    let httpStatus = 0;
    try {
      res = await fetch(`${ASAAS_BASE}/transfers`, {
        method: "POST",
        headers: { "access_token": ASAAS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(transferBody),
      });
      httpStatus = res.status;
      data = await res.json().catch(() => ({}));
    } catch (fetchErr: any) {
      await adminClient.from("pool_payouts").update({
        status: "failed",
        failure_reason: `Erro de rede: ${fetchErr.message}`,
        raw_response: { error: fetchErr.message },
      }).eq("id", payout_id);
      throw new Error(`Falha de rede ao chamar Asaas: ${fetchErr.message}`);
    }

    console.log("Asaas transfer response:", httpStatus, JSON.stringify(data).slice(0, 500));

    if (httpStatus >= 400) {
      const reason = data?.errors?.[0]?.description || `HTTP ${httpStatus}`;
      await adminClient.from("pool_payouts").update({
        status: "failed",
        failure_reason: `Asaas: ${reason}`,
        raw_response: data,
      }).eq("id", payout_id);
      return jsonResp({
        success: false,
        error: `Falha ao executar transferência: ${reason}`,
        asaas_status: httpStatus,
        asaas_response: data,
      }, 200);
    }

    // Sucesso — Asaas pode retornar status PENDING/BANK_PROCESSING/DONE
    const asaasStatus = data?.status || "PENDING";
    const isDone = asaasStatus === "DONE";

    const update: any = {
      asaas_transfer_id: data?.id ? String(data.id) : null,
      asaas_status: asaasStatus,
      raw_response: data,
    };
    if (isDone) {
      update.status = "sent";
      update.sent_at = new Date().toISOString();
    } else {
      // Mantém em "processing" — webhook TRANSFER_DONE atualizará
      update.status = "processing";
    }

    const { error: updateError } = await adminClient
      .from("pool_payouts").update(update).eq("id", payout_id);
    if (updateError) throw updateError;

    return jsonResp({
      success: true,
      asaas_transfer_id: data?.id,
      asaas_status: asaasStatus,
      message: isDone
        ? "Transferência PIX concluída via Asaas."
        : "Transferência PIX em processamento no Asaas. Aguardando confirmação.",
    }, 200);
  } catch (e: any) {
    console.error("asaas-execute-payout error:", e);
    return jsonResp({ error: e.message || "Erro inesperado" }, 500);
  }
});

async function getUserId(req: Request, url: string, anonKey: string): Promise<string | null> {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return null;
    const userClient = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    return user?.id || null;
  } catch { return null; }
}

function jsonResp(body: any, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
