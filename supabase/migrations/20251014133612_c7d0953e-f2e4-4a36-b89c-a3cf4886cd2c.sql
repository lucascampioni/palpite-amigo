-- Add prize columns to pools table
ALTER TABLE public.pools
ADD COLUMN first_place_prize numeric,
ADD COLUMN second_place_prize numeric,
ADD COLUMN third_place_prize numeric;