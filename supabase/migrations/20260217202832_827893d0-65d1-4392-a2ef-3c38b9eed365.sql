
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
BEGIN
  cpf_value := new.raw_user_meta_data->>'cpf';
  phone_value := new.raw_user_meta_data->>'phone';
  whatsapp_value := COALESCE((new.raw_user_meta_data->>'wants_whatsapp_group')::boolean, false);
  notify_pool_updates_value := COALESCE((new.raw_user_meta_data->>'notify_pool_updates')::boolean, true);
  notify_new_pools_value := COALESCE((new.raw_user_meta_data->>'notify_new_pools')::boolean, true);

  INSERT INTO public.profiles (id, full_name, cpf_hash, phone, wants_whatsapp_group, notify_pool_updates, notify_new_pools)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Usuário'),
    CASE 
      WHEN cpf_value IS NOT NULL THEN encode(extensions.digest(convert_to(cpf_value, 'UTF8'), 'sha256'::text), 'hex')
      ELSE NULL
    END,
    phone_value,
    whatsapp_value,
    notify_pool_updates_value,
    notify_new_pools_value
  );

  RETURN new;
END;
$function$;
