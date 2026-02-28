
-- Add column to track if community notification was sent
ALTER TABLE public.pools ADD COLUMN community_notified boolean NOT NULL DEFAULT false;
