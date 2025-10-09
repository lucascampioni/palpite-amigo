-- Allow authenticated users to view PIX keys for active pools
-- This is necessary because users need to see the PIX key to make payment BEFORE joining
-- Security: Requires authentication (prevents mass scraping by bots/public)
-- This is the most secure approach given the business requirement
CREATE POLICY "Authenticated users can view payment info for joining pools"
ON public.pool_payment_info
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.pools
    WHERE pools.id = pool_payment_info.pool_id
      AND pools.status = 'active'
  )
);