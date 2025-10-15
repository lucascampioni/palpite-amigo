-- Drop the restrictive policy
DROP POLICY IF EXISTS "Participants visible after deadline or finish" ON public.participants;

-- Create a new policy that allows approved participants to see all participants in their pool
CREATE POLICY "Approved participants can view all pool participants"
ON public.participants
FOR SELECT
USING (
  -- User can see their own participation
  auth.uid() = user_id
  OR
  -- Pool owner can see all
  (EXISTS (
    SELECT 1 FROM pools 
    WHERE pools.id = participants.pool_id 
    AND pools.owner_id = auth.uid()
  ))
  OR
  -- Approved participants can see all participants in the same pool
  (EXISTS (
    SELECT 1 
    FROM participants viewer
    WHERE viewer.user_id = auth.uid()
      AND viewer.pool_id = participants.pool_id
      AND viewer.status = 'approved'::participant_status
  ))
);