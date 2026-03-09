
-- Allow pool owners to insert participants into their own pools
CREATE POLICY "Pool owners can add participants to their pools"
ON public.participants
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM pools
    WHERE pools.id = participants.pool_id
      AND pools.owner_id = auth.uid()
  )
);
