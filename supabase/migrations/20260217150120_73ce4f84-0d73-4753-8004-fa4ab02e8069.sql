
-- Create a helper function to check if user can create pools
CREATE OR REPLACE FUNCTION public.can_create_pools()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_app_admin() OR EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'pool_creator')
  )
$$;

-- Update pool INSERT policy to allow pool_creators
DROP POLICY IF EXISTS "Only app admin can create pools" ON public.pools;
CREATE POLICY "Admins and pool creators can create pools"
ON public.pools
FOR INSERT
WITH CHECK (can_create_pools());

-- Update pool UPDATE policy to allow pool_creators (for their own pools)
DROP POLICY IF EXISTS "Only app admin can update pools" ON public.pools;
CREATE POLICY "Admins and pool creators can update pools"
ON public.pools
FOR UPDATE
USING (is_app_admin() OR (auth.uid() = owner_id AND public.has_role(auth.uid(), 'pool_creator')));

-- Update pool DELETE policy to allow pool_creators (for their own pools)  
DROP POLICY IF EXISTS "Only app admin can delete pools" ON public.pools;
CREATE POLICY "Admins and pool creators can delete pools"
ON public.pools
FOR DELETE
USING (is_app_admin() OR (auth.uid() = owner_id AND public.has_role(auth.uid(), 'pool_creator')));

-- Also allow pool_creators to create matches for their pools
DROP POLICY IF EXISTS "Pool owners can create matches" ON public.football_matches;
CREATE POLICY "Pool owners can create matches"
ON public.football_matches
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM pools
  WHERE pools.id = football_matches.pool_id
    AND pools.owner_id = auth.uid()
));

-- Allow pool_creators to insert payment info
DROP POLICY IF EXISTS "Pool owners can insert payment info" ON public.pool_payment_info;
CREATE POLICY "Pool owners can insert payment info"
ON public.pool_payment_info
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM pools
  WHERE pools.id = pool_payment_info.pool_id
    AND pools.owner_id = auth.uid()
));
