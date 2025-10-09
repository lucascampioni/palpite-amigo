-- Create user stats table
CREATE TABLE public.user_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  total_pools_created INTEGER NOT NULL DEFAULT 0,
  total_pools_joined INTEGER NOT NULL DEFAULT 0,
  total_wins INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view all stats"
  ON public.user_stats FOR SELECT
  USING (true);

CREATE POLICY "Users can update own stats"
  ON public.user_stats FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stats"
  ON public.user_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add foreign key
ALTER TABLE public.user_stats
  ADD CONSTRAINT user_stats_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- Trigger for updated_at
CREATE TRIGGER update_user_stats_updated_at
  BEFORE UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create football matches table
CREATE TABLE public.football_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL,
  match_date TIMESTAMPTZ NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  championship TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.football_matches ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view matches"
  ON public.football_matches FOR SELECT
  USING (true);

CREATE POLICY "Pool owners can create matches"
  ON public.football_matches FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pools
      WHERE pools.id = pool_id
      AND pools.owner_id = auth.uid()
    )
  );

CREATE POLICY "Pool owners can update matches"
  ON public.football_matches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.pools
      WHERE pools.id = pool_id
      AND pools.owner_id = auth.uid()
    )
  );

-- Add foreign key
ALTER TABLE public.football_matches
  ADD CONSTRAINT football_matches_pool_id_fkey
  FOREIGN KEY (pool_id)
  REFERENCES public.pools(id)
  ON DELETE CASCADE;

-- Trigger for updated_at
CREATE TRIGGER update_football_matches_updated_at
  BEFORE UPDATE ON public.football_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create football predictions table
CREATE TABLE public.football_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL,
  match_id UUID NOT NULL,
  home_score_prediction INTEGER NOT NULL,
  away_score_prediction INTEGER NOT NULL,
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(participant_id, match_id)
);

-- Enable RLS
ALTER TABLE public.football_predictions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Pool participants can view predictions"
  ON public.football_predictions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants
      WHERE participants.id = participant_id
    )
  );

CREATE POLICY "Participants can insert predictions"
  ON public.football_predictions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.participants
      WHERE participants.id = participant_id
      AND participants.user_id = auth.uid()
    )
  );

CREATE POLICY "Participants can update own predictions"
  ON public.football_predictions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.participants
      WHERE participants.id = participant_id
      AND participants.user_id = auth.uid()
    )
  );

-- Add foreign keys
ALTER TABLE public.football_predictions
  ADD CONSTRAINT football_predictions_participant_id_fkey
  FOREIGN KEY (participant_id)
  REFERENCES public.participants(id)
  ON DELETE CASCADE;

ALTER TABLE public.football_predictions
  ADD CONSTRAINT football_predictions_match_id_fkey
  FOREIGN KEY (match_id)
  REFERENCES public.football_matches(id)
  ON DELETE CASCADE;

-- Trigger for updated_at
CREATE TRIGGER update_football_predictions_updated_at
  BEFORE UPDATE ON public.football_predictions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to calculate points for football predictions
CREATE OR REPLACE FUNCTION public.calculate_football_points(
  predicted_home INTEGER,
  predicted_away INTEGER,
  actual_home INTEGER,
  actual_away INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  points INTEGER := 0;
  predicted_result TEXT;
  actual_result TEXT;
BEGIN
  -- Exact score: 5 points
  IF predicted_home = actual_home AND predicted_away = actual_away THEN
    RETURN 5;
  END IF;
  
  -- Determine match results
  IF predicted_home > predicted_away THEN
    predicted_result := 'home';
  ELSIF predicted_home < predicted_away THEN
    predicted_result := 'away';
  ELSE
    predicted_result := 'draw';
  END IF;
  
  IF actual_home > actual_away THEN
    actual_result := 'home';
  ELSIF actual_home < actual_away THEN
    actual_result := 'away';
  ELSE
    actual_result := 'draw';
  END IF;
  
  -- Correct result: 3 points
  IF predicted_result = actual_result THEN
    points := points + 3;
  END IF;
  
  -- Correct goal difference: 1 point
  IF (predicted_home - predicted_away) = (actual_home - actual_away) THEN
    points := points + 1;
  END IF;
  
  RETURN points;
END;
$$;

-- Function to update user stats when pool finishes
CREATE OR REPLACE FUNCTION public.update_user_stats_on_pool_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If pool just finished
  IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
    -- Update winner's stats
    IF NEW.winner_id IS NOT NULL THEN
      INSERT INTO public.user_stats (user_id, total_wins)
      VALUES (NEW.winner_id, 1)
      ON CONFLICT (user_id)
      DO UPDATE SET 
        total_wins = user_stats.total_wins + 1,
        updated_at = now();
    END IF;
    
    -- Update creator's stats
    INSERT INTO public.user_stats (user_id, total_pools_created)
    VALUES (NEW.owner_id, 1)
    ON CONFLICT (user_id)
    DO UPDATE SET 
      total_pools_created = user_stats.total_pools_created + 1,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to update user stats
CREATE TRIGGER on_pool_status_change
  AFTER UPDATE ON public.pools
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_stats_on_pool_finish();