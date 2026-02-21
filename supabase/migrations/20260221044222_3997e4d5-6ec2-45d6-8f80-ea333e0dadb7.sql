
-- Drop and recreate get_football_pool_ranking with prediction_set support
DROP FUNCTION IF EXISTS public.get_football_pool_ranking(uuid);

CREATE OR REPLACE FUNCTION public.get_football_pool_ranking(p_pool_id uuid)
 RETURNS TABLE(participant_id uuid, participant_name text, total_points integer, prediction_set integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id AS participant_id,
    p.participant_name,
    COALESCE(SUM(fp.points_earned), 0)::int AS total_points,
    COALESCE(fp.prediction_set, 1) AS prediction_set
  FROM participants p
  LEFT JOIN football_predictions fp ON fp.participant_id = p.id
  WHERE p.pool_id = p_pool_id
    AND p.status = 'approved'
  GROUP BY p.id, p.participant_name, fp.prediction_set
  ORDER BY total_points DESC, p.participant_name ASC, fp.prediction_set ASC
$function$;
