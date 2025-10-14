-- Fix handle_new_user function to use correct pgcrypto digest signature (bytea)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cpf_value text;
BEGIN
  -- Extrair CPF dos metadados
  cpf_value := new.raw_user_meta_data->>'cpf';
  
  -- Inserir perfil com CPF hasheado
  INSERT INTO public.profiles (id, full_name, cpf_hash)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Usuário'),
    CASE 
      WHEN cpf_value IS NOT NULL THEN encode(digest(cpf_value::bytea, 'sha256'), 'hex')
      ELSE NULL
    END
  );
  
  RETURN new;
END;
$$;