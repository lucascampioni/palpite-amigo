
-- 1. Create financials table
CREATE TABLE public.participant_financials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL UNIQUE REFERENCES public.participants(id) ON DELETE CASCADE,
  pool_id uuid NOT NULL,
  user_id uuid NOT NULL,
  participant_pix_key text,
  pix_key_type text,
  pix_consent boolean NOT NULL DEFAULT false,
  payment_proof text,
  prize_pix_key text,
  prize_pix_key_type text,
  prize_proof_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pf_pool ON public.participant_financials(pool_id);
CREATE INDEX idx_pf_user ON public.participant_financials(user_id);
CREATE INDEX idx_pf_payment_proof_null ON public.participant_financials(pool_id) WHERE payment_proof IS NULL;

-- 2. Backfill from participants
INSERT INTO public.participant_financials (
  participant_id, pool_id, user_id,
  participant_pix_key, pix_key_type, pix_consent,
  payment_proof, prize_pix_key, prize_pix_key_type, prize_proof_url
)
SELECT
  p.id, p.pool_id, p.user_id,
  p.participant_pix_key, p.pix_key_type, COALESCE(p.pix_consent, false),
  p.payment_proof, p.prize_pix_key, p.prize_pix_key_type, p.prize_proof_url
FROM public.participants p
WHERE p.participant_pix_key IS NOT NULL
   OR p.pix_key_type IS NOT NULL
   OR p.pix_consent IS TRUE
   OR p.payment_proof IS NOT NULL
   OR p.prize_pix_key IS NOT NULL
   OR p.prize_pix_key_type IS NOT NULL
   OR p.prize_proof_url IS NOT NULL;

-- 3. Enable RLS and policies
ALTER TABLE public.participant_financials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own financials"
  ON public.participant_financials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Pool owners view financials"
  ON public.participant_financials FOR SELECT
  USING (public.is_pool_owner(pool_id, auth.uid()));

CREATE POLICY "Admins view all financials"
  ON public.participant_financials FOR SELECT
  USING (public.is_user_admin());

CREATE POLICY "Users insert own financials"
  ON public.participant_financials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Pool owners insert financials"
  ON public.participant_financials FOR INSERT
  WITH CHECK (public.is_pool_owner(pool_id, auth.uid()));

CREATE POLICY "Admins insert financials"
  ON public.participant_financials FOR INSERT
  WITH CHECK (public.is_user_admin());

CREATE POLICY "Users update own financials"
  ON public.participant_financials FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Pool owners update financials"
  ON public.participant_financials FOR UPDATE
  USING (public.is_pool_owner(pool_id, auth.uid()));

CREATE POLICY "Admins update financials"
  ON public.participant_financials FOR UPDATE
  USING (public.is_user_admin());

CREATE POLICY "Users delete own financials"
  ON public.participant_financials FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins delete financials"
  ON public.participant_financials FOR DELETE
  USING (public.is_user_admin());

-- 4. updated_at trigger
CREATE TRIGGER trg_pf_updated_at
  BEFORE UPDATE ON public.participant_financials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Drop sensitive columns from participants
ALTER TABLE public.participants
  DROP COLUMN participant_pix_key,
  DROP COLUMN pix_key_type,
  DROP COLUMN pix_consent,
  DROP COLUMN payment_proof,
  DROP COLUMN prize_pix_key,
  DROP COLUMN prize_pix_key_type,
  DROP COLUMN prize_proof_url;
