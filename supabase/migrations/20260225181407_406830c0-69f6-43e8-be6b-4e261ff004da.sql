
-- Add 'cancelled' to pool_status enum
ALTER TYPE public.pool_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Add cancelled_notified column to pools
ALTER TABLE public.pools ADD COLUMN IF NOT EXISTS cancelled_notified boolean NOT NULL DEFAULT false;
