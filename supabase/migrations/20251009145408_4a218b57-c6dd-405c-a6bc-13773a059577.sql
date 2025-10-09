-- Add PIX key field to pools table
ALTER TABLE public.pools
ADD COLUMN pix_key TEXT;