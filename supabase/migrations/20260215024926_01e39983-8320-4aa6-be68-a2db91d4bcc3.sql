
-- Add columns to track VIP group invite response
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS vip_group_invited_at timestamptz,
ADD COLUMN IF NOT EXISTS vip_group_accepted boolean;

-- Remove wants_whatsapp_group column (no longer needed at signup)
-- Keep the column for now but it won't be used anymore
