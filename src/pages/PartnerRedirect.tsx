import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const PartnerRedirect = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const clean = (slug || "").trim().toLowerCase();
      if (!clean) {
        navigate("/", { replace: true });
        return;
      }
      try {
        const { data } = await supabase
          .from("partner_links")
          .select("slug, active")
          .eq("slug", clean)
          .eq("active", true)
          .maybeSingle();

        if (data?.slug) {
          try {
            localStorage.setItem("partner_link_slug", data.slug);
            localStorage.setItem("partner_link_slug_at", String(Date.now()));
          } catch {}
          // count the click (best-effort)
          supabase.rpc("track_partner_link_click", { p_slug: data.slug }).then(() => {});
        }
      } catch (e) {
        console.error("Falha ao resolver link de parceiro", e);
      }
      navigate("/entrar?tab=signup", { replace: true });
    })();
  }, [slug, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <p className="text-sm text-muted-foreground">Redirecionando…</p>
    </div>
  );
};

export default PartnerRedirect;
