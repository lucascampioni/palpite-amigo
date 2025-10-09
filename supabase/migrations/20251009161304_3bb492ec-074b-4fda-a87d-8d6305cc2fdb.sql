-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view payment info for joining pools" ON public.pool_payment_info;

-- Drop the restrictive policy that only shows to approved participants
DROP POLICY IF EXISTS "Approved participants can view payment info" ON public.pool_payment_info;

-- Create new policy: Users who have joined (even if pending approval) can see PIX key
-- This is secure because:
-- 1. User must be authenticated
-- 2. User must have created a participant record (shows real interest)
-- 3. Prevents mass scraping by random authenticated users
CREATE POLICY "Participants can view payment info"
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