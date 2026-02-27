
-- Allow pending participants to also cancel (delete) their own participation
DROP POLICY IF EXISTS "Users can delete own rejected participation" ON public.participants;
CREATE POLICY "Users can delete own pending or rejected participation"
ON public.participants
FOR DELETE
USING (auth.uid() = user_id AND status IN ('pending', 'rejected'));

-- Also allow deleting predictions for pending participants (currently only rejected)
DROP POLICY IF EXISTS "Users can delete predictions of own rejected participation" ON public.football_predictions;
CREATE POLICY "Users can delete predictions of own pending or rejected participation"
ON public.football_predictions
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM participants p
  WHERE p.id = football_predictions.participant_id
    AND p.user_id = auth.uid()
    AND p.status IN ('pending', 'rejected')
));
