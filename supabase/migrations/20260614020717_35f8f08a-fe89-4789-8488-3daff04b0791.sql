REVOKE EXECUTE ON FUNCTION public.get_football_pool_ranking_fast(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_football_pool_ranking_fast(uuid) TO authenticated, service_role;