
-- Add notification tracking columns to pools table
ALTER TABLE public.pools 
  ADD COLUMN IF NOT EXISTS first_match_notified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finished_notified boolean NOT NULL DEFAULT false;
