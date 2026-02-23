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

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check admin via is_app_admin
    // Check admin via is_app_admin (email-based) OR is_user_admin (role-based)
    const { data: isAppAdmin } = await anonClient.rpc("is_app_admin");
    const { data: isUserAdmin } = await anonClient.rpc("is_user_admin");
    if (!isAppAdmin && !isUserAdmin) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "list_users": {
        const { search, page = 1, limit = 20 } = body;
        const offset = (page - 1) * limit;
        
        let query = adminClient
          .from("profiles")
          .select("id, full_name, phone, phone_verified, avatar_url, created_at", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (search) {
          query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);
        }

        const { data: profiles, error, count } = await query;
        if (error) throw error;

        // Get roles for these users
        const userIds = profiles?.map((p: any) => p.id) || [];
        const { data: roles } = await adminClient
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds);

        // Get emails from auth
        const usersWithEmails = [];
        for (const profile of profiles || []) {
          const { data: authData } = await adminClient.auth.admin.getUserById(profile.id);
          usersWithEmails.push({
            ...profile,
            email: authData?.user?.email || "",
            roles: roles?.filter((r: any) => r.user_id === profile.id).map((r: any) => r.role) || [],
          });
        }

        return new Response(JSON.stringify({ users: usersWithEmails, total: count }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      case "update_role": {
        const { user_id, role, roleAction } = body;
        if (!user_id || !role) throw new Error("user_id e role são obrigatórios");

        if (roleAction === "add") {
          const { error } = await adminClient
            .from("user_roles")
            .upsert({ user_id, role }, { onConflict: "user_id,role" });
          if (error) throw error;
        } else if (roleAction === "remove") {
          const { error } = await adminClient
            .from("user_roles")
            .delete()
            .eq("user_id", user_id)
            .eq("role", role);
          if (error) throw error;
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      case "delete_user": {
        const { user_id } = body;
        if (!user_id) throw new Error("user_id é obrigatório");

        // Don't allow deleting yourself
        if (user_id === caller.id) {
          return new Response(JSON.stringify({ error: "Não é possível excluir sua própria conta" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // Clean up all related data before deleting auth user
        // 1. Get all participations
        const { data: userParticipants } = await adminClient
          .from("participants")
          .select("id")
          .eq("user_id", user_id);
        const participantIds = (userParticipants || []).map((p: any) => p.id);

        // 2. Delete football predictions
        if (participantIds.length > 0) {
          await adminClient.from("football_predictions").delete().in("participant_id", participantIds);
        }

        // 3. Delete participants
        await adminClient.from("participants").delete().eq("user_id", user_id);

        // 4. Delete pix access logs
        await adminClient.from("pix_key_access_logs").delete().eq("accessed_by", user_id);

        // 5. Delete user roles
        await adminClient.from("user_roles").delete().eq("user_id", user_id);

        // 6. Delete user stats
        await adminClient.from("user_stats").delete().eq("user_id", user_id);

        // 7. Delete whatsapp OTPs
        await adminClient.from("whatsapp_otp").delete().eq("user_id", user_id);

        // 8. Delete profile
        await adminClient.from("profiles").delete().eq("id", user_id);

        // 9. Finally delete auth user
        const { error } = await adminClient.auth.admin.deleteUser(user_id);
        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      case "list_pools": {
        const { search, page = 1, limit = 20 } = body;
        const offset = (page - 1) * limit;

        let query = adminClient
          .from("pools")
          .select("id, title, status, pool_type, created_at, owner_id, entry_fee", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (search) {
          query = query.ilike("title", `%${search}%`);
        }

        const { data: pools, error, count } = await query;
        if (error) throw error;

        // Get owner names
        const ownerIds = [...new Set(pools?.map((p: any) => p.owner_id) || [])];
        const { data: owners } = await adminClient
          .from("profiles")
          .select("id, full_name")
          .in("id", ownerIds);

        const poolsWithOwners = pools?.map((p: any) => ({
          ...p,
          owner_name: owners?.find((o: any) => o.id === p.owner_id)?.full_name || "Desconhecido",
        }));

        return new Response(JSON.stringify({ pools: poolsWithOwners, total: count }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      case "delete_pool": {
        const { pool_id } = body;
        if (!pool_id) throw new Error("pool_id é obrigatório");

        // Get participant IDs first, then delete predictions
        const { data: participantRows } = await adminClient
          .from("participants")
          .select("id")
          .eq("pool_id", pool_id);
        const participantIds = (participantRows || []).map((p: any) => p.id);
        if (participantIds.length > 0) {
          await adminClient.from("football_predictions").delete().in("participant_id", participantIds);
        }
        await adminClient.from("participants").delete().eq("pool_id", pool_id);
        await adminClient.from("football_matches").delete().eq("pool_id", pool_id);
        await adminClient.from("pool_payment_info").delete().eq("pool_id", pool_id);
        
        const { error } = await adminClient.from("pools").delete().eq("id", pool_id);
        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      case "update_pool_status": {
        const { pool_id, status } = body;
        if (!pool_id || !status) throw new Error("pool_id e status são obrigatórios");

        const { error } = await adminClient
          .from("pools")
          .update({ status })
          .eq("id", pool_id);
        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Ação desconhecida" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
    }
  } catch (e: any) {
    console.error("admin-actions error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erro inesperado" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
