ALTER TABLE public.pools ADD COLUMN IF NOT EXISTS reminder_3h_sent boolean NOT NULL DEFAULT false;
ALTER TABLE public.pools ADD COLUMN IF NOT EXISTS reminder_30min_sent boolean NOT NULL DEFAULT false;