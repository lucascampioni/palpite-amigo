-- Allow any authenticated user to view approved participants in public (non-private) pools
-- This enables showing prize amounts and participant counts on public pool pages
CREATE POLICY "Authenticated users can view participants in public pools"
  ON public.participants
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM pools
      WHERE pools.id = participants.pool_id
        AND pools.is_private = false
        AND participants.status = 'approved'
    )
  );
