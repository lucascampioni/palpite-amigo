-- Remove the pix_key column from pools table as it's now in pool_payment_info
ALTER TABLE public.pools DROP COLUMN IF EXISTS pix_key;