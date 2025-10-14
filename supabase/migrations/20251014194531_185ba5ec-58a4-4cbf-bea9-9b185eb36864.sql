-- Drop existing policy that allows all authenticated users to view active pools
DROP POLICY IF EXISTS "Authenticated users can view active pools" ON public.pools;

-- Create new policy: authenticated users can view non-official active pools
CREATE POLICY "Authenticated users can view non-official active pools"
ON public.pools
FOR SELECT
TO authenticated
USING (
  status IN ('active', 'finished')
  AND is_official = false
);

-- Create new policy: only admin can view official pools
CREATE POLICY "Only admin can view official pools"
ON public.pools
FOR SELECT
TO authenticated
USING (
  is_official = true
  AND is_app_admin()
);