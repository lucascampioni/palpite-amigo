
UPDATE pools SET scoring_system = 'exact_only' WHERE id = 'bab0f50f-972c-486b-b8fc-1d8bb75b6676';

UPDATE football_predictions fp
SET points_earned = CASE
  WHEN fp.home_score_prediction = fm.home_score AND fp.away_score_prediction = fm.away_score THEN 1
  ELSE 0
END
FROM football_matches fm
WHERE fm.id = fp.match_id
  AND fm.pool_id = 'bab0f50f-972c-486b-b8fc-1d8bb75b6676'
  AND fm.status = 'finished';
