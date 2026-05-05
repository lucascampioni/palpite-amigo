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
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const normalizedEmail = email.trim().toLowerCase();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase.rpc("check_email_status", {
      _email: normalizedEmail,
    });

    if (error) {
      console.error("Error checking email status, falling back:", error);
      const { data: existsFallback } = await supabase.rpc("check_email_exists", {
        _email: normalizedEmail,
      });
      return new Response(JSON.stringify({ exists: !!existsFallback }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const status = data || { exists: false };

    // Remove auth records that were created without a profile, so the person can retry signup.
    if (status.exists && status.has_profile === false && status.user_id) {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(status.user_id);
      if (deleteError) {
        console.error("Error deleting orphan auth user:", deleteError);
      } else {
        return new Response(JSON.stringify({ exists: false, recovered_orphan: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    return new Response(JSON.stringify({
      exists: !!status.exists,
      email_confirmed: !!status.email_confirmed,
      has_profile: status.has_profile !== false,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error("check-email-exists error:", e);
    return new Response(JSON.stringify({ error: "Erro inesperado" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
