import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate(`/entrar?redirect=${encodeURIComponent(location.pathname)}`);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("phone, phone_verified")
        .eq("id", session.user.id)
        .single();

      if (profile && profile.phone !== null && profile.phone !== '' && !profile.phone_verified) {
        navigate("/verificacao-sms");
        return;
      }

      setAuthorized(true);
      setChecking(false);
    };

    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate(`/entrar?redirect=${encodeURIComponent(location.pathname)}`);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, location.pathname]);

  if (checking && !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
