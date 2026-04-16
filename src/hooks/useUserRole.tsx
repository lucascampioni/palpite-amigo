import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useUserRole = () => {
  return useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { isAdmin: false, isPoolCreator: false, isEstabelecimento: false, canReceiveInApp: false, canCreatePools: false, role: null };

      // Check if user is app admin (via email check)
      const { data: isAppAdmin, error: appAdminError } = await supabase
        .rpc("is_app_admin");

      if (appAdminError) {
        console.error("Error checking app admin:", appAdminError);
      }

      // Always fetch user_roles to detect in_app_payment even for app admins
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (error) {
        console.error("Error fetching user role:", error);
      }

      const roles = data?.map(r => r.role) || [];
      const canReceiveInApp = roles.includes("in_app_payment" as any);

      if (isAppAdmin) {
        return { isAdmin: true, isPoolCreator: false, isEstabelecimento: false, canReceiveInApp, canCreatePools: true, role: "admin" };
      }

      const isAdmin = roles.includes("admin");
      const isPoolCreator = roles.includes("pool_creator");
      const isEstabelecimento = roles.includes("estabelecimento");

      return {
        isAdmin,
        isPoolCreator,
        isEstabelecimento,
        canReceiveInApp,
        canCreatePools: isAdmin || isPoolCreator || isEstabelecimento,
        role: isAdmin ? "admin" : isPoolCreator ? "pool_creator" : isEstabelecimento ? "estabelecimento" : (roles[0] || null),
      };
    },
  });
};
