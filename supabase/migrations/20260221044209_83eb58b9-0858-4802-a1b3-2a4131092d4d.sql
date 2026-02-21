
-- Add prediction_set column to football_predictions
ALTER TABLE public.football_predictions 
ADD COLUMN prediction_set integer NOT NULL DEFAULT 1;

-- Drop old unique constraints if they exist
ALTER TABLE public.football_predictions DROP CONSTRAINT IF EXISTS football_predictions_participant_id_match_id_key;
ALTER TABLE public.football_predictions DROP CONSTRAINT IF EXISTS unique_prediction;

-- Add new unique constraint including prediction_set
ALTER TABLE public.football_predictions 
ADD CONSTRAINT football_predictions_participant_match_set_unique 
UNIQUE (participant_id, match_id, prediction_set);
