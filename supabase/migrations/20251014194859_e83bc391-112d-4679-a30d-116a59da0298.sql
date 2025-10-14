-- Drop the policies created in the previous migration
DROP POLICY IF EXISTS "Authenticated users can view non-official active pools" ON public.pools;
DROP POLICY IF EXISTS "Only admin can view official pools" ON public.pools;

-- Recreate the original policy with a special condition for the two specific pools
CREATE POLICY "Authenticated users can view active pools"
ON public.pools
FOR SELECT
TO authenticated
USING (
  status IN ('active', 'finished')
  AND auth.uid() IS NOT NULL
  AND (
    -- Allow everyone to see non-restricted pools
    NOT (title IN ('Bolão oficial #1', 'Bolão oficial #2'))
    OR
    -- Only admin can see the two specific official pools
    (title IN ('Bolão oficial #1', 'Bolão oficial #2') AND is_app_admin())
  )
);