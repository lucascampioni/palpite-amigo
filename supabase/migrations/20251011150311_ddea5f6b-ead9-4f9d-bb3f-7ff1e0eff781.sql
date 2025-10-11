-- Add scoring_system column to pools table
ALTER TABLE pools ADD COLUMN scoring_system TEXT NOT NULL DEFAULT 'standard';

-- Add comment explaining the scoring systems
COMMENT ON COLUMN pools.scoring_system IS 'Scoring system: standard (5-3-1 points) or exact_only (1 point for exact score only)';