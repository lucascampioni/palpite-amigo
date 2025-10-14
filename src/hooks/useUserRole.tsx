import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useUserRole = () => {
  return useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { isAdmin: false, role: null };

      // Check if user is app admin (via email check)
      const { data: isAppAdmin, error: appAdminError } = await supabase
        .rpc("is_app_admin");

      if (appAdminError) {
        console.error("Error checking app admin:", appAdminError);
      }

      if (isAppAdmin) {
        return { isAdmin: true, role: "admin" };
      }

      // Also check user_roles table for backward compatibility
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Ignore "no rows" error
        console.error("Error fetching user role:", error);
      }

      return {
        isAdmin: data?.role === "admin" || false,
        role: data?.role || null,
      };
    },
  });
};
