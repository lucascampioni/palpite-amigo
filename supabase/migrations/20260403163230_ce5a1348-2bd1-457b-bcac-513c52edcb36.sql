
CREATE OR REPLACE FUNCTION public.get_pool_participants_phone_suffix(p_pool_id uuid)
RETURNS TABLE(user_id uuid, phone_suffix text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT
    p.user_id,
    CASE 
      WHEN pr.phone IS NOT NULL AND length(regexp_replace(pr.phone, '\D', '', 'g')) >= 4
      THEN right(regexp_replace(pr.phone, '\D', '', 'g'), 4)
      ELSE NULL
    END AS phone_suffix
  FROM participants p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.pool_id = p_pool_id
    AND p.status = 'approved'
$$;
