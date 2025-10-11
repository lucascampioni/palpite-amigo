-- Add external reference fields to football_matches for GE integration
ALTER TABLE public.football_matches
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS external_source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_football_matches_external_id ON public.football_matches(external_id, external_source);

COMMENT ON COLUMN public.football_matches.external_id IS 'External match ID from source like Globo Esporte';
COMMENT ON COLUMN public.football_matches.external_source IS 'Source of the match data: manual, ge (Globo Esporte), etc';
COMMENT ON COLUMN public.football_matches.last_sync_at IS 'Last time match data was synced from external source';