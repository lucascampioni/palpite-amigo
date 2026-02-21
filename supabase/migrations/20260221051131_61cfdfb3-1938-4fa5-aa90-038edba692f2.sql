
-- Allow users to delete their own rejected participant records
CREATE POLICY "Users can delete own rejected participation"
ON public.participants
FOR DELETE
USING (auth.uid() = user_id AND status = 'rejected'::participant_status);

-- Allow users to delete predictions linked to their own rejected participation
CREATE POLICY "Users can delete predictions of own rejected participation"
ON public.football_predictions
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM participants p
  WHERE p.id = football_predictions.participant_id
    AND p.user_id = auth.uid()
    AND p.status = 'rejected'::participant_status
));
