-- Auto-submit prize PIX for Gabriel using his profile key
WITH part AS (
  SELECT p.id AS participant_id, p.pool_id, p.user_id, pr.pix_key, pr.pix_key_type
  FROM participants p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.id = 'a98477be-a078-4ca5-afba-3bbfeb7f889a'
)
INSERT INTO participant_financials (participant_id, pool_id, user_id, prize_pix_key, prize_pix_key_type)
SELECT participant_id, pool_id, user_id, pix_key, pix_key_type FROM part
ON CONFLICT (participant_id) DO UPDATE
  SET prize_pix_key = EXCLUDED.prize_pix_key,
      prize_pix_key_type = EXCLUDED.prize_pix_key_type,
      updated_at = now();

UPDATE participants
SET prize_status = 'pix_submitted', prize_submitted_at = now()
WHERE id = 'a98477be-a078-4ca5-afba-3bbfeb7f889a';