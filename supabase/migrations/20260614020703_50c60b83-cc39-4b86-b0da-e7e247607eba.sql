CREATE OR REPLACE FUNCTION public.get_football_pool_ranking_fast(p_pool_id uuid)
RETURNS TABLE(
  participant_id uuid,
  participant_name text,
  total_points integer,
  prediction_set integer,
  user_id uuid,
  prize_status text,
  earliest_prediction_at timestamp with time zone,
  exact_scores integer,
  correct_results integer,
  has_predictions boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH pool_matches AS (
    SELECT id, home_score, away_score, status
    FROM public.football_matches
    WHERE pool_id = p_pool_id
  ),
  approved_participants AS (
    SELECT id, participant_name, user_id, prize_status
    FROM public.participants
    WHERE pool_id = p_pool_id
      AND status = 'approved'
  ),
  ranking_rows AS (
    SELECT
      p.id AS participant_id,
      p.participant_name,
      p.user_id,
      p.prize_status::text AS prize_status,
      COALESCE(fp.prediction_set, 1) AS prediction_set,
      COALESCE(SUM(fp.points_earned), 0)::int AS total_points,
      MIN(fp.created_at) AS earliest_prediction_at,
      COUNT(fp.id) > 0 AS has_predictions,
      COALESCE(COUNT(fp.id) FILTER (
        WHERE pm.status = 'finished'
          AND pm.home_score IS NOT NULL
          AND pm.away_score IS NOT NULL
          AND fp.home_score_prediction = pm.home_score
          AND fp.away_score_prediction = pm.away_score
      ), 0)::int AS exact_scores,
      COALESCE(COUNT(fp.id) FILTER (
        WHERE pm.status = 'finished'
          AND pm.home_score IS NOT NULL
          AND pm.away_score IS NOT NULL
          AND (
            (fp.home_score_prediction > fp.away_score_prediction AND pm.home_score > pm.away_score)
            OR (fp.home_score_prediction < fp.away_score_prediction AND pm.home_score < pm.away_score)
            OR (fp.home_score_prediction = fp.away_score_prediction AND pm.home_score = pm.away_score)
          )
      ), 0)::int AS correct_results
    FROM approved_participants p
    LEFT JOIN public.football_predictions fp ON fp.participant_id = p.id
    LEFT JOIN pool_matches pm ON pm.id = fp.match_id
    GROUP BY p.id, p.participant_name, p.user_id, p.prize_status, COALESCE(fp.prediction_set, 1)
  )
  SELECT
    participant_id,
    participant_name,
    total_points,
    prediction_set,
    user_id,
    prize_status,
    earliest_prediction_at,
    exact_scores,
    correct_results,
    has_predictions
  FROM ranking_rows
  ORDER BY total_points DESC, participant_name ASC, prediction_set ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_football_pool_ranking_fast(uuid) TO anon, authenticated, service_role;