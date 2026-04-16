
-- Platform settings (admin-controlled)
CREATE TABLE public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view platform settings"
  ON public.platform_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only admins can insert platform settings"
  ON public.platform_settings FOR INSERT
  WITH CHECK (is_app_admin() OR is_user_admin());

CREATE POLICY "Only admins can update platform settings"
  ON public.platform_settings FOR UPDATE
  USING (is_app_admin() OR is_user_admin());

INSERT INTO public.platform_settings (key, value)
VALUES ('delfos_fee_percent', '0'::jsonb);

-- Mark pools that use in-app payment
ALTER TABLE public.pools 
  ADD COLUMN payment_method text NOT NULL DEFAULT 'pix_manual';

-- Payment transactions
CREATE TABLE public.pool_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL,
  participant_id uuid,
  user_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL,
  mp_payment_id text UNIQUE,
  mp_qr_code text,
  mp_qr_code_base64 text,
  mp_ticket_url text,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  expires_at timestamptz,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pool_transactions_pool ON public.pool_transactions(pool_id);
CREATE INDEX idx_pool_transactions_user ON public.pool_transactions(user_id);
CREATE INDEX idx_pool_transactions_mp ON public.pool_transactions(mp_payment_id);
CREATE INDEX idx_pool_transactions_status ON public.pool_transactions(status);

ALTER TABLE public.pool_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own transactions"
  ON public.pool_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Pool owners view pool transactions"
  ON public.pool_transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM pools WHERE pools.id = pool_transactions.pool_id AND pools.owner_id = auth.uid()));

CREATE POLICY "Admins view all transactions"
  ON public.pool_transactions FOR SELECT
  USING (is_app_admin() OR is_user_admin());

CREATE POLICY "Users can insert own transactions"
  ON public.pool_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Payouts
CREATE TABLE public.pool_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL,
  recipient_user_id uuid,
  recipient_type text NOT NULL,
  pix_key text,
  pix_key_type text,
  amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval',
  mp_transfer_id text,
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  failure_reason text,
  notes text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pool_payouts_pool ON public.pool_payouts(pool_id);
CREATE INDEX idx_pool_payouts_recipient ON public.pool_payouts(recipient_user_id);
CREATE INDEX idx_pool_payouts_status ON public.pool_payouts(status);

ALTER TABLE public.pool_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients view own payouts"
  ON public.pool_payouts FOR SELECT
  USING (auth.uid() = recipient_user_id);

CREATE POLICY "Pool owners view pool payouts"
  ON public.pool_payouts FOR SELECT
  USING (EXISTS (SELECT 1 FROM pools WHERE pools.id = pool_payouts.pool_id AND pools.owner_id = auth.uid()));

CREATE POLICY "Admins manage payouts"
  ON public.pool_payouts FOR ALL
  USING (is_app_admin() OR is_user_admin())
  WITH CHECK (is_app_admin() OR is_user_admin());

-- Triggers
CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pool_transactions_updated_at
  BEFORE UPDATE ON public.pool_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pool_payouts_updated_at
  BEFORE UPDATE ON public.pool_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper function
CREATE OR REPLACE FUNCTION public.can_receive_in_app_payments(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'in_app_payment'::app_role
  )
$$;
