-- Delete all data from tables (cascades will handle related records)
-- First delete participants (to avoid FK constraints)
DELETE FROM participants;

-- Delete football predictions
DELETE FROM football_predictions;

-- Delete football matches
DELETE FROM football_matches;

-- Delete payment info
DELETE FROM pool_payment_info;

-- Finally delete all pools
DELETE FROM pools;

-- Verify deletion
SELECT 'Pools deleted' as status, COUNT(*) as remaining FROM pools
UNION ALL
SELECT 'Participants deleted', COUNT(*) FROM participants
UNION ALL
SELECT 'Football matches deleted', COUNT(*) FROM football_matches
UNION ALL
SELECT 'Football predictions deleted', COUNT(*) FROM football_predictions;