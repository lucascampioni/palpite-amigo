-- Fix prediction visibility and update policies to enforce deadlines

-- 1. Drop and recreate policy for viewing predictions after deadline or finish
DROP POLICY IF EXISTS "Anyone can view predictions after pool finished" ON football_predictions;

CREATE POLICY "View predictions after deadline or finish"
ON football_predictions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM participants p
    JOIN pools po ON po.id = p.pool_id
    WHERE p.id = football_predictions.participant_id
      AND (
        po.status = 'finished'
        OR po.deadline < NOW()
      )
  )
  OR EXISTS (
    SELECT 1 FROM participants p
    WHERE p.id = football_predictions.participant_id
      AND p.user_id = auth.uid()
  )
);

-- 2. Drop and recreate policy to prevent prediction updates after deadline
DROP POLICY IF EXISTS "Participants can update own predictions" ON football_predictions;

CREATE POLICY "Update predictions before deadline only"
ON football_predictions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM participants p
    JOIN pools po ON po.id = p.pool_id
    WHERE p.id = football_predictions.participant_id
      AND p.user_id = auth.uid()
      AND po.deadline > NOW()
      AND po.status = 'active'
  )
);

-- 3. Add policy to hide guess_value before deadline for custom pools
-- First drop existing select policies on participants table to recreate them with deadline checks
DROP POLICY IF EXISTS "Participants visible after pool finished" ON participants;

CREATE POLICY "Participants visible after deadline or finish"
ON participants FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM pools
    WHERE pools.id = participants.pool_id
      AND pools.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM pools
    WHERE pools.id = participants.pool_id
      AND (pools.status = 'finished' OR pools.deadline < NOW())
  )
);