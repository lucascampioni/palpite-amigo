
-- 1) Restrict pool creation to admins / pool_creator / estabelecimento
CREATE OR REPLACE FUNCTION public.can_create_pools()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pool_creator'::app_role)
    OR public.has_role(auth.uid(), 'estabelecimento'::app_role)
    OR public.is_app_admin()
  )
$$;

-- 2) Remove overly-broad pool-owner write policies on payment-proofs storage.
-- Owners retain SELECT via the scoped "Pool owners can view participant payment proofs" policy.
-- Users still manage their own files via the "Users can ..." policies.
DROP POLICY IF EXISTS "Pool owners can upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Pool owners can update payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Pool owners can delete payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Pool owners can view payment proofs" ON storage.objects;

-- 3) Restrict voucher claiming to vouchers whose phone matches the user's profile phone.
DROP POLICY IF EXISTS "Users can claim unused vouchers" ON public.pool_vouchers;
CREATE POLICY "Users can claim unused vouchers"
ON public.pool_vouchers
FOR UPDATE
TO authenticated
USING (
  used_by IS NULL
  AND phone IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid()
      AND pr.phone IS NOT NULL
      AND regexp_replace(pr.phone, '\D', '', 'g') = regexp_replace(pool_vouchers.phone, '\D', '', 'g')
  )
)
WITH CHECK (
  used_by = auth.uid()
);
