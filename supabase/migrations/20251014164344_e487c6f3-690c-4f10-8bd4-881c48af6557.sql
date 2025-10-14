-- Ensure handle_new_user can access pgcrypto in extensions schema
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $$
DECLARE
  cpf_value text;
BEGIN
  cpf_value := new.raw_user_meta_data->>'cpf';

  INSERT INTO public.profiles (id, full_name, cpf_hash)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Usuário'),
    CASE 
      WHEN cpf_value IS NOT NULL THEN encode(extensions.digest(convert_to(cpf_value, 'UTF8'), 'sha256'::text), 'hex')
      ELSE NULL
    END
  );

  RETURN new;
END;
$$;