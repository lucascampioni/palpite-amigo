-- Remove the policy that restricts viewing predictions until after deadline
DROP POLICY IF EXISTS "View predictions after deadline or finish" ON public.football_predictions;

-- Create a new policy allowing all approved participants to view all predictions in their pool
CREATE POLICY "Approved participants can view all predictions in pool"
ON public.football_predictions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM participants p1
    JOIN participants p2 ON p1.pool_id = p2.pool_id
    JOIN football_matches fm ON fm.id = football_predictions.match_id
    WHERE p1.id = football_predictions.participant_id
      AND p2.user_id = auth.uid()
      AND p2.status = 'approved'::participant_status
      AND fm.pool_id = p1.pool_id
  )
);