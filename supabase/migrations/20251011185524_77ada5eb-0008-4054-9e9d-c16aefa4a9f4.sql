-- Add max_participants column to pools table
ALTER TABLE public.pools 
ADD COLUMN max_participants INTEGER;

COMMENT ON COLUMN public.pools.max_participants IS 'Maximum number of participants allowed. NULL means unlimited';