-- Drop the complex policy
DROP POLICY IF EXISTS "Approved participants can view all predictions in pool" ON public.football_predictions;

-- Create a simpler, more direct policy
CREATE POLICY "Approved participants see all pool predictions"
ON public.football_predictions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM participants viewer
    JOIN participants predictor ON viewer.pool_id = predictor.pool_id
    JOIN football_matches fm ON fm.id = football_predictions.match_id
    WHERE viewer.user_id = auth.uid()
      AND viewer.status = 'approved'::participant_status
      AND predictor.id = football_predictions.participant_id
      AND fm.pool_id = viewer.pool_id
  )
);