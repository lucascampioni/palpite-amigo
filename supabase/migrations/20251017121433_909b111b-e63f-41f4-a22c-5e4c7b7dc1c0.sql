-- Add phone and whatsapp group preference to profiles table
ALTER TABLE public.profiles
ADD COLUMN phone text,
ADD COLUMN wants_whatsapp_group boolean DEFAULT false;

-- Update the handle_new_user function to include phone and whatsapp preference
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
BEGIN
  cpf_value := new.raw_user_meta_data->>'cpf';
  phone_value := new.raw_user_meta_data->>'phone';
  whatsapp_value := COALESCE((new.raw_user_meta_data->>'wants_whatsapp_group')::boolean, false);

  INSERT INTO public.profiles (id, full_name, cpf_hash, phone, wants_whatsapp_group)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Usuário'),
    CASE 
      WHEN cpf_value IS NOT NULL THEN encode(extensions.digest(convert_to(cpf_value, 'UTF8'), 'sha256'::text), 'hex')
      ELSE NULL
    END,
    phone_value,
    whatsapp_value
  );

  RETURN new;
END;
$function$;