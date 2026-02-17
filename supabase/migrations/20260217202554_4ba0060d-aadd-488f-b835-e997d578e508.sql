
-- Add notification preference columns to profiles
ALTER TABLE public.profiles
ADD COLUMN notify_pool_updates boolean NOT NULL DEFAULT true,
ADD COLUMN notify_new_pools boolean NOT NULL DEFAULT true;
