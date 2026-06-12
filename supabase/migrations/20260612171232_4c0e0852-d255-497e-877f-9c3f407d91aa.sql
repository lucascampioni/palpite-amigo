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
    phone_verified,
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
    true,
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
    phone_verified = true,
    wants_whatsapp_group = EXCLUDED.wants_whatsapp_group,
    notify_pool_updates = EXCLUDED.notify_pool_updates,
    notify_new_pools = EXCLUDED.notify_new_pools,
    partner_link_slug = COALESCE(public.profiles.partner_link_slug, EXCLUDED.partner_link_slug),
    updated_at = now();

  RETURN new;
END;
$function$;