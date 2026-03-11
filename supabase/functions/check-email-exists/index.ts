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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use the GoTrue admin API to check if user exists by email
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
    });

    // Alternative: use the admin client to list and filter
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const normalizedEmail = email.trim().toLowerCase();

    // Query via SQL using service role - most efficient
    const { data, error } = await supabase.rpc('check_email_exists_fn' as any, { _email: normalizedEmail });
    
    // If the RPC doesn't exist, fall back to listing users
    if (error) {
      // Fallback: use admin API
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 50,
      });

      if (listError) {
        console.error("Error listing users:", listError);
        return new Response(JSON.stringify({ exists: false }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Check all pages if needed - but for now check first batch
      const exists = listData.users.some(u => u.email?.toLowerCase() === normalizedEmail);
      
      return new Response(JSON.stringify({ exists }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ exists: !!data }), {
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
