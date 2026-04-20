// Edge function: webhook de validação de saque do Asaas.
// Asaas chama este endpoint antes de executar uma transferência PIX (POST /v3/transfers).
// Sempre aprovamos automaticamente — a validação de quem pode sacar é feita no nosso backend
// (asaas-execute-payout exige admin autenticado ou chamada interna assinada).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
    const sentToken = req.headers.get("asaas-access-token");
    if (WEBHOOK_TOKEN && sentToken && sentToken !== WEBHOOK_TOKEN) {
      console.warn("Token inválido em asaas-transfer-validation:", sentToken?.slice(0, 6));
      return new Response(JSON.stringify({ approved: false, reason: "invalid_token" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = await req.json().catch(() => ({}));
    console.log("asaas-transfer-validation recebido:", JSON.stringify(body).slice(0, 800));

    // Resposta com TODAS as variações aceitas pelo Asaas (cobre mudanças de spec)
    const approveResponse = {
      approved: true,
      approve: true,
      status: "APPROVED",
      authorized: true,
    };

    console.log("asaas-transfer-validation respondendo:", JSON.stringify(approveResponse));

    return new Response(JSON.stringify(approveResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("asaas-transfer-validation error:", e);
    return new Response(
      JSON.stringify({ approved: true, approve: true, status: "APPROVED", authorized: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
