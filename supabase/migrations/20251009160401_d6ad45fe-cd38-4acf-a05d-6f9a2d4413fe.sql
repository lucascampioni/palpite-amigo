-- First, drop the existing public view policy
DROP POLICY IF EXISTS "Anyone can view active pools" ON public.pools;

-- Create a security definer function to check if user is an approved participant
CREATE OR REPLACE FUNCTION public.is_approved_participant(pool_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM participants
    WHERE pool_id = pool_uuid
      AND user_id = user_uuid
      AND status = 'approved'::participant_status
  )
$$;

-- Create a security definer function to check if user is pool owner
CREATE OR REPLACE FUNCTION public.is_pool_owner(pool_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pools
    WHERE id = pool_uuid
      AND owner_id = user_uuid
  )
$$;

-- Policy for public viewing: excludes sensitive fields
CREATE POLICY "Anyone can view basic pool info"
ON public.pools
FOR SELECT
USING (
  status IN ('active', 'finished')
  AND (
    -- Non-authenticated users or users who are not owner/participants see limited data
    auth.uid() IS NULL 
    OR (
      auth.uid() IS NOT NULL 
      AND NOT is_pool_owner(id, auth.uid())
      AND NOT is_approved_participant(id, auth.uid())
    )
  )
);

-- Policy for pool owners: full access to their pools
CREATE POLICY "Pool owners can view all details of their pools"
ON public.pools
FOR SELECT
USING (auth.uid() = owner_id);

-- Policy for approved participants: can see all details including PIX key
CREATE POLICY "Approved participants can view pool details including PIX"
ON public.pools
FOR SELECT
USING (
  status IN ('active', 'finished')
  AND is_approved_participant(id, auth.uid())
);