-- Add entry_fee column to pools table
ALTER TABLE public.pools 
ADD COLUMN entry_fee DECIMAL(10,2);