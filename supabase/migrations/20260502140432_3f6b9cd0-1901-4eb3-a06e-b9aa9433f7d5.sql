-- Restrict football_matches read access to authenticated users
DROP POLICY IF EXISTS "Anyone can view matches" ON public.football_matches;

CREATE POLICY "Authenticated users can view matches"
ON public.football_matches
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);