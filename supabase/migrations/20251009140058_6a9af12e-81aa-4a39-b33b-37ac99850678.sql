-- Tighten RLS to prevent authenticated-wide scraping

-- 1) Profiles: restrict SELECT to the owner only
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 2) User stats: restrict SELECT to the owner only
DROP POLICY IF EXISTS "Users can view all stats" ON public.user_stats;

CREATE POLICY "Users can view own stats"
ON public.user_stats
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
