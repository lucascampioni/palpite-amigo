
-- Partner referral links for admin tracking
CREATE TABLE public.partner_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  partner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text,
  active boolean NOT NULL DEFAULT true,
  click_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.partner_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_links TO authenticated;
GRANT ALL ON public.partner_links TO service_role;

ALTER TABLE public.partner_links ENABLE ROW LEVEL SECURITY;

-- Public can read active links (to resolve /p/:slug)
CREATE POLICY "Anyone can read active partner links"
ON public.partner_links FOR SELECT
USING (active = true);

-- Admins manage all
CREATE POLICY "Admins manage partner links"
ON public.partner_links FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_app_admin())
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_app_admin());

CREATE TRIGGER trg_partner_links_updated
BEFORE UPDATE ON public.partner_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attribution: which partner link the user signed up through
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS partner_link_slug text;

CREATE INDEX IF NOT EXISTS idx_profiles_partner_link_slug
ON public.profiles(partner_link_slug)
WHERE partner_link_slug IS NOT NULL;

-- Capture slug from user metadata on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public, extensions'
AS $function$
DECLARE
  cpf_value text;
  phone_value text;
  whatsapp_value boolean;
  notify_pool_updates_value boolean;
  notify_new_pools_value boolean;
  partner_slug_value text;
BEGIN
  cpf_value := NULLIF(regexp_replace(COALESCE(new.raw_user_meta_data->>'cpf', ''), '\D', '', 'g'), '');
  phone_value := NULLIF(regexp_replace(COALESCE(new.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), '');
  whatsapp_value := COALESCE((new.raw_user_meta_data->>'wants_whatsapp_group')::boolean, false);
  notify_pool_updates_value := COALESCE((new.raw_user_meta_data->>'notify_pool_updates')::boolean, true);
  notify_new_pools_value := COALESCE((new.raw_user_meta_data->>'notify_new_pools')::boolean, true);
  partner_slug_value := NULLIF(trim(COALESCE(new.raw_user_meta_data->>'partner_link_slug', '')), '');

  INSERT INTO public.profiles (
    id,
    full_name,
    cpf_hash,
    phone,
    wants_whatsapp_group,
    notify_pool_updates,
    notify_new_pools,
    partner_link_slug
  )
  VALUES (
    new.id,
    COALESCE(NULLIF(trim(new.raw_user_meta_data->>'full_name'), ''), 'Usuário'),
    CASE
      WHEN cpf_value IS NOT NULL THEN encode(extensions.digest(convert_to(cpf_value, 'UTF8'), 'sha256'::text), 'hex')
      ELSE NULL
    END,
    phone_value,
    whatsapp_value,
    notify_pool_updates_value,
    notify_new_pools_value,
    partner_slug_value
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    cpf_hash = COALESCE(public.profiles.cpf_hash, EXCLUDED.cpf_hash),
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
    wants_whatsapp_group = EXCLUDED.wants_whatsapp_group,
    notify_pool_updates = EXCLUDED.notify_pool_updates,
    notify_new_pools = EXCLUDED.notify_new_pools,
    partner_link_slug = COALESCE(public.profiles.partner_link_slug, EXCLUDED.partner_link_slug),
    updated_at = now();

  RETURN new;
END;
$function$;

-- Increment click counter (public)
CREATE OR REPLACE FUNCTION public.track_partner_link_click(p_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.partner_links
  SET click_count = click_count + 1, updated_at = now()
  WHERE slug = p_slug AND active = true;
$$;

GRANT EXECUTE ON FUNCTION public.track_partner_link_click(text) TO anon, authenticated;

-- Admin stats: links with signup counts
CREATE OR REPLACE FUNCTION public.get_partner_links_with_stats()
RETURNS TABLE(
  id uuid,
  slug text,
  label text,
  active boolean,
  click_count integer,
  signup_count integer,
  partner_user_id uuid,
  partner_name text,
  partner_phone text,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pl.id, pl.slug, pl.label, pl.active, pl.click_count,
    COALESCE((SELECT COUNT(*)::int FROM public.profiles pr WHERE pr.partner_link_slug = pl.slug), 0) AS signup_count,
    pl.partner_user_id,
    p.full_name AS partner_name,
    p.phone AS partner_phone,
    pl.created_at
  FROM public.partner_links pl
  LEFT JOIN public.profiles p ON p.id = pl.partner_user_id
  WHERE public.has_role(auth.uid(), 'admin'::app_role) OR public.is_app_admin()
  ORDER BY pl.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.get_partner_links_with_stats() TO authenticated;

-- Admin: list signups attributed to a slug
CREATE OR REPLACE FUNCTION public.get_partner_link_signups(p_slug text)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  phone text,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.id, pr.full_name, pr.phone, pr.created_at
  FROM public.profiles pr
  WHERE pr.partner_link_slug = p_slug
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_app_admin())
  ORDER BY pr.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.get_partner_link_signups(text) TO authenticated;
