-- Allow pool owners to view all profiles (for WhatsApp promotional messages)
CREATE POLICY "Pool owners can view profiles with phone"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM pools WHERE pools.owner_id = auth.uid()
  )
);
