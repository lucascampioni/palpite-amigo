
ALTER TABLE public.pools ADD COLUMN IF NOT EXISTS is_free_pool boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.free_pool_allowance(p_pool_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'allowance', 1 + COALESCE((
      SELECT COUNT(*)::int FROM public.pool_referrals
      WHERE pool_id = p_pool_id AND referrer_user_id = p_user_id
    ), 0),
    'used', COALESCE((
      SELECT COUNT(*)::int FROM public.participants
      WHERE pool_id = p_pool_id AND user_id = p_user_id AND status <> 'rejected'
    ), 0),
    'has_used_code', EXISTS (
      SELECT 1 FROM public.pool_referrals
      WHERE pool_id = p_pool_id AND referred_user_id = p_user_id
    )
  );
$$;

REVOKE ALL ON FUNCTION public.free_pool_allowance(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.free_pool_allowance(uuid, uuid) TO authenticated;
