
CREATE OR REPLACE FUNCTION public.get_pool_owner_phone(pool_uuid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT p.phone
  FROM profiles p
  JOIN pools po ON po.owner_id = p.id
  WHERE po.id = pool_uuid
$$;
