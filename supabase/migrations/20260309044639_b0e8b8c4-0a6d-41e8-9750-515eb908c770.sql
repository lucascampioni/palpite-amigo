-- Add prediction_sets column to pool_vouchers table
ALTER TABLE public.pool_vouchers 
ADD COLUMN prediction_sets integer NOT NULL DEFAULT 1;