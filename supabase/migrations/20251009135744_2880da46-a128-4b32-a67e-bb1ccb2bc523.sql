-- Fix security issue: Restrict profiles table to authenticated users only
-- This prevents public scraping of user data while allowing legitimate users to see participant names

-- Drop the existing public policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create a new policy that only allows authenticated users to view profiles
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);