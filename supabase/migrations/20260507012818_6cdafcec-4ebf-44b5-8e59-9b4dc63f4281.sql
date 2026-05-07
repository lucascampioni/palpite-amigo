
-- Tabela de créditos de indicação
CREATE TABLE public.referral_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pool_id uuid NOT NULL,
  source_referral_id uuid,
  consumed_at timestamptz,
  consumed_participant_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_referral_credits_user_pool ON public.referral_credits(user_id, pool_id) WHERE consumed_at IS NULL;
CREATE INDEX idx_referral_credits_referral ON public.referral_credits(source_referral_id);

ALTER TABLE public.referral_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own credits" ON public.referral_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users consume own credits" ON public.referral_credits
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage credits" ON public.referral_credits
  FOR ALL USING (is_app_admin() OR is_user_admin())
  WITH CHECK (is_app_admin() OR is_user_admin());

-- Função utilitária
CREATE OR REPLACE FUNCTION public.count_available_referral_credits(p_user_id uuid, p_pool_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.referral_credits
  WHERE user_id = p_user_id AND pool_id = p_pool_id AND consumed_at IS NULL
$$;

-- Migrar participantes "referral_reward" antigos sem palpites para créditos
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.id AS participant_id, p.user_id, p.pool_id, pf.payment_proof
    FROM public.participants p
    JOIN public.participant_financials pf ON pf.participant_id = p.id
    WHERE pf.payment_proof LIKE 'referral_reward%'
      AND p.status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM public.football_predictions fp WHERE fp.participant_id = p.id)
  LOOP
    INSERT INTO public.referral_credits (user_id, pool_id, source_referral_id)
    VALUES (r.user_id, r.pool_id, NULL);

    DELETE FROM public.participant_financials WHERE participant_id = r.participant_id;
    DELETE FROM public.participants WHERE id = r.participant_id;
  END LOOP;
END $$;
