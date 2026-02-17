-- Allow pool owners to delete football matches (needed for pool deletion)
CREATE POLICY "Pool owners can delete matches"
ON public.football_matches
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM pools
  WHERE pools.id = football_matches.pool_id
  AND pools.owner_id = auth.uid()
));
