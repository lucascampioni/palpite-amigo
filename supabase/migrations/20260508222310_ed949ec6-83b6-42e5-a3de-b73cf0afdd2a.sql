
DO $$
DECLARE
  pids uuid[];
BEGIN
  SELECT array_agg(id) INTO pids FROM participants
  WHERE pool_id='de4355aa-8308-4558-b060-355d2c854a80' AND status='approved';

  IF pids IS NOT NULL THEN
    DELETE FROM football_predictions WHERE participant_id = ANY(pids);
    DELETE FROM participant_financials WHERE participant_id = ANY(pids);
    DELETE FROM pool_transactions WHERE participant_id = ANY(pids);
    UPDATE referral_credits SET consumed_at=NULL, consumed_participant_id=NULL WHERE consumed_participant_id = ANY(pids);
    UPDATE pool_referrals SET reward_participant_id=NULL WHERE reward_participant_id = ANY(pids);
    UPDATE pool_referrals SET referred_participant_id=NULL WHERE referred_participant_id = ANY(pids);
    DELETE FROM pix_key_access_logs WHERE participant_id = ANY(pids);
    DELETE FROM participants WHERE id = ANY(pids);
  END IF;
END $$;
