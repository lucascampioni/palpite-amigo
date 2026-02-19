-- Add PIX key fields to profiles table for reuse across pools
ALTER TABLE public.profiles ADD COLUMN pix_key text;
ALTER TABLE public.profiles ADD COLUMN pix_key_type text;