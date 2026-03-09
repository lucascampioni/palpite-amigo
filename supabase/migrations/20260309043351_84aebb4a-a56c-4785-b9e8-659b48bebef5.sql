
CREATE TABLE public.pool_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  code text NOT NULL,
  used_by uuid REFERENCES public.profiles(id),
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(pool_id, code)
);

ALTER TABLE public.pool_vouchers ENABLE ROW LEVEL SECURITY;

-- Pool owners can manage vouchers
CREATE POLICY "Pool owners can insert vouchers"
  ON public.pool_vouchers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM pools WHERE pools.id = pool_vouchers.pool_id AND pools.owner_id = auth.uid()));

CREATE POLICY "Pool owners can view vouchers"
  ON public.pool_vouchers FOR SELECT
  USING (EXISTS (SELECT 1 FROM pools WHERE pools.id = pool_vouchers.pool_id AND pools.owner_id = auth.uid()));

CREATE POLICY "Pool owners can delete vouchers"
  ON public.pool_vouchers FOR DELETE
  USING (EXISTS (SELECT 1 FROM pools WHERE pools.id = pool_vouchers.pool_id AND pools.owner_id = auth.uid()));

CREATE POLICY "Pool owners can update vouchers"
  ON public.pool_vouchers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM pools WHERE pools.id = pool_vouchers.pool_id AND pools.owner_id = auth.uid()));

-- Users can view vouchers they've used
CREATE POLICY "Users can view own used vouchers"
  ON public.pool_vouchers FOR SELECT
  USING (used_by = auth.uid());

-- Authenticated users can view unused vouchers by code (for redemption)
CREATE POLICY "Authenticated users can check voucher by code"
  ON public.pool_vouchers FOR SELECT
  USING (auth.uid() IS NOT NULL AND used_by IS NULL);

-- Users can update voucher to mark as used (claim)
CREATE POLICY "Users can claim unused vouchers"
  ON public.pool_vouchers FOR UPDATE
  USING (auth.uid() IS NOT NULL AND used_by IS NULL)
  WITH CHECK (used_by = auth.uid());
