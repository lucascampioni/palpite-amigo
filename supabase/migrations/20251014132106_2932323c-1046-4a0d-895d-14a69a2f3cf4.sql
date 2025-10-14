-- Habilitar extensão de criptografia
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Adicionar coluna para armazenar hash do CPF na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN cpf_hash text UNIQUE;

-- Criar índice para melhor performance nas buscas
CREATE INDEX idx_profiles_cpf_hash ON public.profiles(cpf_hash);

-- Atualizar função handle_new_user para processar CPF
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      WHEN cpf_value IS NOT NULL THEN encode(digest(cpf_value, 'sha256'), 'hex')
      ELSE NULL
    END
  );
  
  RETURN new;
END;
$function$;