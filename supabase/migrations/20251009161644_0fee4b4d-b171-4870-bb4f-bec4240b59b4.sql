-- Replace the policy with better documentation
DROP POLICY IF EXISTS "Participants can view payment info" ON public.pool_payment_info;

-- Policy allows participants (including pending) to view PIX key
-- BUSINESS REQUIREMENT: Users need PIX key to make payment AFTER submitting prediction but BEFORE approval
-- SECURITY: Still secure because:
-- 1. Requires authentication
-- 2. Requires creating a participant record (user showed real interest by submitting predictions)
-- 3. Prevents mass scraping by random users
-- This is a calculated trade-off between security and UX
CREATE POLICY "Participants can view payment info for payment"
ON public.pool_payment_info
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.participants p
    WHERE p.pool_id = pool_payment_info.pool_id
      AND p.user_id = auth.uid()
  )
);

COMMENT ON POLICY "Participants can view payment info for payment" ON public.pool_payment_info IS 
'Allows participants (including pending status) to view PIX keys. This is necessary for the payment flow: user submits prediction → sees PIX key → makes payment → gets approved. The risk is mitigated by requiring actual participation record creation.';