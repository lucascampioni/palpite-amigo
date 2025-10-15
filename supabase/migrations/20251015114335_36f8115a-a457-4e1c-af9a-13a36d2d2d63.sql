-- Fix recursive RLS on participants and simplify predictions policy using helper function

-- Participants: drop problematic policy
DROP POLICY IF EXISTS "Approved participants can view all pool participants" ON public.participants;

-- Create non-recursive policy leveraging SECURITY DEFINER function
CREATE POLICY "Approved participants view participants in same pool"
ON public.participants
FOR SELECT
USING (
  -- Self can always see own row
  auth.uid() = user_id
  OR
  -- Pool owner can see all participants
  EXISTS (
    SELECT 1 FROM pools 
    WHERE pools.id = participants.pool_id 
      AND pools.owner_id = auth.uid()
  )
  OR
  -- Any approved participant can see all participants in their pool
  is_approved_participant(participants.pool_id, auth.uid())
);

-- Football predictions: avoid joins to participants in policy to prevent recursion cascades
DROP POLICY IF EXISTS "Approved participants see all pool predictions" ON public.football_predictions;

CREATE POLICY "Approved participants view all predictions in pool"
ON public.football_predictions
FOR SELECT
USING (
  -- Any approved participant in the pool of the match can see all predictions
  EXISTS (
    SELECT 1 FROM football_matches fm
    WHERE fm.id = football_predictions.match_id
      AND is_approved_participant(fm.pool_id, auth.uid())
  )
  OR
  -- Owners can view all predictions (keep behavior)
  EXISTS (
    SELECT 1 FROM participants p
    JOIN pools po ON po.id = p.pool_id
    WHERE p.id = football_predictions.participant_id
      AND po.owner_id = auth.uid()
  )
  OR
  -- Users can always see their own predictions (keep behavior)
  EXISTS (
    SELECT 1 FROM participants p
    WHERE p.id = football_predictions.participant_id
      AND p.user_id = auth.uid()
  )
);