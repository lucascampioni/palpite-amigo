-- Restore signup-related triggers that are required for a complete account
-- A complete signup must create: auth user + public profile + default user role.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $$
DECLARE
  cpf_value text;
  phone_value text;
  whatsapp_value boolean;
  notify_pool_updates_value boolean;
  notify_new_pools_value boolean;
BEGIN
  cpf_value := NULLIF(regexp_replace(COALESCE(new.raw_user_meta_data->>'cpf', ''), '\D', '', 'g'), '');
  phone_value := NULLIF(regexp_replace(COALESCE(new.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), '');
  whatsapp_value := COALESCE((new.raw_user_meta_data->>'wants_whatsapp_group')::boolean, false);
  notify_pool_updates_value := COALESCE((new.raw_user_meta_data->>'notify_pool_updates')::boolean, true);
  notify_new_pools_value := COALESCE((new.raw_user_meta_data->>'notify_new_pools')::boolean, true);

  INSERT INTO public.profiles (
    id,
    full_name,
    cpf_hash,
    phone,
    wants_whatsapp_group,
    notify_pool_updates,
    notify_new_pools
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
    notify_new_pools_value
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    cpf_hash = COALESCE(public.profiles.cpf_hash, EXCLUDED.cpf_hash),
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
    wants_whatsapp_group = EXCLUDED.wants_whatsapp_group,
    notify_pool_updates = EXCLUDED.notify_pool_updates,
    notify_new_pools = EXCLUDED.notify_new_pools,
    updated_at = now();

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_join_official_community()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.community_members (community_id, user_id, notify_new_pools)
  SELECT c.id, NEW.id, NEW.notify_new_pools
  FROM public.communities c
  WHERE c.is_official = true
  ON CONFLICT (community_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_claim_vouchers_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  voucher RECORD;
BEGIN
  FOR voucher IN
    SELECT pv.id, pv.pool_id, pv.prediction_sets, p.title, p.slug
    FROM public.pool_vouchers pv
    JOIN public.pools p ON p.id = pv.pool_id
    WHERE pv.phone = NEW.phone
      AND pv.used_by IS NULL
      AND p.status = 'active'
  LOOP
    UPDATE public.pool_vouchers
    SET used_by = NEW.id, used_at = now()
    WHERE id = voucher.id;

    INSERT INTO public.participants (pool_id, user_id, participant_name, guess_value, status)
    VALUES (voucher.pool_id, NEW.id, NEW.full_name, 'voucher', 'approved')
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_assign_role ON auth.users;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS auto_join_official_community_trigger ON public.profiles;
DROP TRIGGER IF EXISTS on_profile_created_claim_vouchers ON public.profiles;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_created_assign_role
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_role();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER auto_join_official_community_trigger
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_join_official_community();

CREATE TRIGGER on_profile_created_claim_vouchers
AFTER INSERT ON public.profiles
FOR EACH ROW
WHEN (NEW.phone IS NOT NULL)
EXECUTE FUNCTION public.auto_claim_vouchers_on_signup();