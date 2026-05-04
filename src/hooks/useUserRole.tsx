import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useUserRole = () => {
  return useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { isAdmin: false, isPoolCreator: false, isEstabelecimento: false, canReceiveInApp: false, paysByProof: false, canCreatePools: false, role: null };

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
      // Nova regra: por padrão todos recebem via PIX automático (in_app).
      // Quem tem a role 'in_app_payment' fica no MODELO ANTIGO (comprovante manual, sem taxa do app).
      const paysByProof = roles.includes("in_app_payment");
      const canReceiveInApp = !paysByProof;

      if (isAppAdmin) {
        return { isAdmin: true, isPoolCreator: false, isEstabelecimento: false, canReceiveInApp, paysByProof, canCreatePools: true, role: "admin" };
      }

      const isAdmin = roles.includes("admin");
      const isPoolCreator = roles.includes("pool_creator");
      const isEstabelecimento = roles.includes("estabelecimento");

      return {
        isAdmin,
        isPoolCreator,
        isEstabelecimento,
        canReceiveInApp,
        paysByProof,
        canCreatePools: true,
        role: isAdmin ? "admin" : isPoolCreator ? "pool_creator" : isEstabelecimento ? "estabelecimento" : (roles[0] || null),
      };
    },
  });
};
