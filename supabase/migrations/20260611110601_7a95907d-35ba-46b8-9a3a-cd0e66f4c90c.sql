
ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS referral_enabled boolean NOT NULL DEFAULT false;

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
      AND p.status = 'active'
      AND p.is_official = true
      AND p.referral_enabled = true
      AND (p.is_free_pool = true OR COALESCE(p.entry_fee, 0) = 0)
  )
$function$;

CREATE OR REPLACE FUNCTION public.free_pool_allowance(p_pool_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'allowance', 1 + CASE
      WHEN EXISTS (
        SELECT 1 FROM public.pools
        WHERE id = p_pool_id AND referral_enabled = true
      )
      THEN COALESCE((
        SELECT COUNT(*)::int FROM public.pool_referrals
        WHERE pool_id = p_pool_id AND referrer_user_id = p_user_id
      ), 0)
      ELSE 0
    END,
    'used', COALESCE((
      SELECT COUNT(*)::int FROM public.participants
      WHERE pool_id = p_pool_id AND user_id = p_user_id AND status <> 'rejected'
    ), 0),
    'has_used_code', EXISTS (
      SELECT 1 FROM public.pool_referrals
      WHERE pool_id = p_pool_id AND referred_user_id = p_user_id
    )
  );
$function$;
