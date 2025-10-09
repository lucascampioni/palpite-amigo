-- Drop the restrictive public policy
DROP POLICY IF EXISTS "Anyone can view basic pool info" ON public.pools;

-- Create policy for authenticated users to view active/finished pools
-- They can see all info including PIX key (needed for payment before joining)
-- But must be authenticated (prevents public abuse)
CREATE POLICY "Authenticated users can view active pools"
ON public.pools
FOR SELECT
USING (
  status IN ('active', 'finished')
  AND auth.uid() IS NOT NULL
);