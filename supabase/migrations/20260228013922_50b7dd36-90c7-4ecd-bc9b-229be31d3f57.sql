
-- Allow viewing pools that belong to a community (via responsible_user_id)
-- This enables community pool listings for all authenticated users
CREATE POLICY "Users can view pools from communities"
ON public.pools FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.responsible_user_id = pools.owner_id
  )
);
