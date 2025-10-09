-- Update RLS to allow pool owners to update prediction points
DROP POLICY IF EXISTS "Pool owners can update predictions points" ON public.football_predictions;

CREATE POLICY "Pool owners can update predictions points"
ON public.football_predictions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.participants p
    JOIN public.pools po ON po.id = p.pool_id
    WHERE p.id = football_predictions.participant_id
      AND po.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.participants p
    JOIN public.pools po ON po.id = p.pool_id
    WHERE p.id = football_predictions.participant_id
      AND po.owner_id = auth.uid()
  )
);
