CREATE OR REPLACE FUNCTION public.is_pool_referral_eligible(p_pool_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM pools p
    WHERE p.id = p_pool_id
      AND p.prize_type = 'fixed'
      AND p.status = 'active'
      AND p.is_official = true
  )
$function$;