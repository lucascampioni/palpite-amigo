
-- Table to control API sync rate limiting and tracking
CREATE TABLE public.api_sync_control (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type text NOT NULL, -- 'live_scores' or 'daily_fixtures'
  league_id text, -- null for live_scores (global), league id for daily_fixtures
  last_sync_at timestamp with time zone,
  daily_request_count integer NOT NULL DEFAULT 0,
  request_count_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(sync_type, league_id)
);

-- Enable RLS
ALTER TABLE public.api_sync_control ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (edge functions use service role)
-- No public policies needed since this is internal system data

-- Add index for quick lookups
CREATE INDEX idx_api_sync_control_type ON public.api_sync_control(sync_type);

-- Update trigger
CREATE TRIGGER update_api_sync_control_updated_at
  BEFORE UPDATE ON public.api_sync_control
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial control rows
INSERT INTO public.api_sync_control (sync_type, league_id) VALUES
  ('live_scores', NULL);
