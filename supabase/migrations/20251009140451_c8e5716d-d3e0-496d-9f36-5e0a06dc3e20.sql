-- Fix: Hide predictions until pool closes to prevent cheating

-- For football_predictions: Allow viewing only own predictions OR all predictions after pool is finished
DROP POLICY IF EXISTS "Pool participants can view predictions" ON public.football_predictions;

CREATE POLICY "Users can view own predictions anytime"
ON public.football_predictions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM participants
    WHERE participants.id = football_predictions.participant_id
      AND participants.user_id = auth.uid()
  )
);

CREATE POLICY "Pool owners can view all predictions"
ON public.football_predictions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM participants
    JOIN pools ON pools.id = participants.pool_id
    WHERE participants.id = football_predictions.participant_id
      AND pools.owner_id = auth.uid()
  )
);

CREATE POLICY "Anyone can view predictions after pool finished"
ON public.football_predictions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM participants
    JOIN pools ON pools.id = participants.pool_id
    WHERE participants.id = football_predictions.participant_id
      AND pools.status = 'finished'
  )
);

-- For participants table: Create a security definer function to check if pool is finished
CREATE OR REPLACE FUNCTION public.is_pool_finished(pool_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pools
    WHERE id = pool_uuid
      AND status = 'finished'
  )
$$;

-- Add policy to allow viewing all participants only after pool is finished
CREATE POLICY "Participants visible after pool finished"
ON public.participants
FOR SELECT
TO authenticated
USING (
  public.is_pool_finished(pool_id)
);