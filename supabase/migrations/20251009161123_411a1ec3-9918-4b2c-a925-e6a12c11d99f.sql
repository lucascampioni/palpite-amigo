-- Remove the overly permissive policy that allows all authenticated users to see PIX keys
DROP POLICY IF EXISTS "Authenticated users can view payment info for active pools" ON public.pool_payment_info;

-- The remaining policies already cover the necessary access:
-- 1. Pool owners can view/manage their payment info
-- 2. Approved participants can view through the existing policy

-- Add policy for approved participants to view payment info
CREATE POLICY "Approved participants can view payment info"
ON public.pool_payment_info
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.participants p
    JOIN public.pools po ON po.id = p.pool_id
    WHERE p.pool_id = pool_payment_info.pool_id
      AND p.user_id = auth.uid()
      AND p.status = 'approved'::participant_status
      AND po.status = 'active'
  )
);