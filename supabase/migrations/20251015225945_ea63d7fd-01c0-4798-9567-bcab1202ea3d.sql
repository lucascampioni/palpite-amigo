-- Enable realtime updates for live ranking
ALTER TABLE public.football_predictions REPLICA IDENTITY FULL;
ALTER TABLE public.football_matches REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.football_predictions';
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.football_matches';
  EXCEPTION WHEN others THEN NULL;
  END;
END
$$;

-- Public-safe RPC to fetch ranking for a pool (names + points only)
CREATE OR REPLACE FUNCTION public.get_football_pool_ranking(p_pool_id uuid)
RETURNS TABLE (
  participant_id uuid,
  participant_name text,
  total_points integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS participant_id,
    p.participant_name,
    COALESCE(SUM(fp.points_earned), 0)::int AS total_points
  FROM participants p
  LEFT JOIN football_predictions fp ON fp.participant_id = p.id
  WHERE p.pool_id = p_pool_id
    AND p.status = 'approved'
  GROUP BY p.id, p.participant_name
  ORDER BY total_points DESC, p.participant_name ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_football_pool_ranking(uuid) TO anon, authenticated;