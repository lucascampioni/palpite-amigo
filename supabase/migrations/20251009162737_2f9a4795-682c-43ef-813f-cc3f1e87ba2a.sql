-- Add is_private column to pools table
ALTER TABLE public.pools 
ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.pools.is_private IS 'If true, pool only accessible via direct link. If false, appears on home screen for all users.';