
CREATE TABLE IF NOT EXISTS public.pool_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL,
  referrer_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  referred_participant_id uuid,
  reward_participant_id uuid,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz,
  UNIQUE(pool_id, referred_user_id),
  CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_referrals_pool ON public.pool_referrals(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_referrals_referrer ON public.pool_referrals(pool_id, referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_pool_referrals_status ON public.pool_referrals(pool_id, status);

ALTER TABLE public.pool_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own referrals"
  ON public.pool_referrals FOR SELECT
  USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);

CREATE POLICY "Pool owners view referrals"
  ON public.pool_referrals FOR SELECT
  USING (EXISTS (SELECT 1 FROM pools WHERE pools.id = pool_referrals.pool_id AND pools.owner_id = auth.uid()));

CREATE POLICY "Admins view all referrals"
  ON public.pool_referrals FOR SELECT
  USING (is_app_admin() OR is_user_admin());

CREATE POLICY "Referred user can insert own referral"
  ON public.pool_referrals FOR INSERT
  WITH CHECK (auth.uid() = referred_user_id);

CREATE POLICY "Admins manage referrals"
  ON public.pool_referrals FOR ALL
  USING (is_app_admin() OR is_user_admin())
  WITH CHECK (is_app_admin() OR is_user_admin());

CREATE OR REPLACE FUNCTION public.is_pool_referral_eligible(p_pool_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pools p
    JOIN communities c ON c.is_official = true
    WHERE p.id = p_pool_id
      AND p.prize_type = 'fixed'
      AND p.status = 'active'
      AND p.owner_id = c.responsible_user_id
  )
$$;
