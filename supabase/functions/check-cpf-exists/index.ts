import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckCpfRequest { cpf: string }

function toHex(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text: string) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(hash);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cpf }: CheckCpfRequest = await req.json();
    if (!cpf || !/^\d{11}$/.test(cpf)) {
      return new Response(JSON.stringify({ error: "CPF inválido" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const cpfHash = await sha256Hex(cpf);
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("cpf_hash", cpfHash)
      .maybeSingle();

    if (error) {
      console.error("Error checking CPF:", error);
      return new Response(JSON.stringify({ error: "Erro ao verificar CPF" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return new Response(JSON.stringify({ exists: !!data }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (e) {
    console.error("check-cpf-exists error:", e);
    return new Response(JSON.stringify({ error: "Erro inesperado" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});
