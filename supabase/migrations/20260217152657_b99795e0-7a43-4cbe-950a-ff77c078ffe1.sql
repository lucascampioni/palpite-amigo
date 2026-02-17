-- Function to get pool owner name (security definer bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_pool_owner_name(pool_uuid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.full_name
  FROM profiles p
  JOIN pools po ON po.owner_id = p.id
  WHERE po.id = pool_uuid
$$;