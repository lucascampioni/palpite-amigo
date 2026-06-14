CREATE INDEX IF NOT EXISTS idx_participants_pool_status ON public.participants (pool_id, status);
CREATE INDEX IF NOT EXISTS idx_participants_pool_user ON public.participants (pool_id, user_id);
CREATE INDEX IF NOT EXISTS idx_football_matches_pool ON public.football_matches (pool_id);
CREATE INDEX IF NOT EXISTS idx_football_predictions_participant ON public.football_predictions (participant_id) INCLUDE (prediction_set, points_earned, match_id, home_score_prediction, away_score_prediction);
ANALYZE public.participants;
ANALYZE public.football_matches;
ANALYZE public.football_predictions;