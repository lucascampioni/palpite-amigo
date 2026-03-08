
-- Add 'estabelecimento' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'estabelecimento';

-- Add estabelecimento_prize_description column to pools table
ALTER TABLE public.pools ADD COLUMN IF NOT EXISTS estabelecimento_prize_description text;
