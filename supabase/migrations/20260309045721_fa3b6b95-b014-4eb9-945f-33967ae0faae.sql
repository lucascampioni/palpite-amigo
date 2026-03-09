-- Add phone column to pool_vouchers for direct registration
ALTER TABLE public.pool_vouchers 
ADD COLUMN phone text;