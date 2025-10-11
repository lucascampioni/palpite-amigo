-- Add team crest columns to football_matches table
ALTER TABLE football_matches 
ADD COLUMN IF NOT EXISTS home_team_crest TEXT,
ADD COLUMN IF NOT EXISTS away_team_crest TEXT;