import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useUserRole = () => {
  return useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { isAdmin: false, isPoolCreator: false, canCreatePools: false, role: null };

      // Check if user is app admin (via email check)
      const { data: isAppAdmin, error: appAdminError } = await supabase
        .rpc("is_app_admin");

      if (appAdminError) {
        console.error("Error checking app admin:", appAdminError);
      }

      if (isAppAdmin) {
        return { isAdmin: true, isPoolCreator: false, canCreatePools: true, role: "admin" };
      }

      // Check user_roles table
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (error) {
        console.error("Error fetching user role:", error);
      }

      const roles = data?.map(r => r.role) || [];
      const isAdmin = roles.includes("admin");
      const isPoolCreator = roles.includes("pool_creator");

      return {
        isAdmin,
        isPoolCreator,
        canCreatePools: isAdmin || isPoolCreator,
        role: isAdmin ? "admin" : isPoolCreator ? "pool_creator" : (roles[0] || null),
      };
    },
  });
};
