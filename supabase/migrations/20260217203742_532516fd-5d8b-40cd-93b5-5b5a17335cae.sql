
-- Add phone_verified to profiles
ALTER TABLE public.profiles
ADD COLUMN phone_verified boolean NOT NULL DEFAULT false;

-- Create OTP codes table
CREATE TABLE public.whatsapp_otp (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL,
  code text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamp with time zone NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_otp ENABLE ROW LEVEL SECURITY;

-- Users can view their own OTP entries
CREATE POLICY "Users can view own OTP" ON public.whatsapp_otp
FOR SELECT USING (auth.uid() = user_id);

-- Users can insert OTP for themselves
CREATE POLICY "Users can insert own OTP" ON public.whatsapp_otp
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update own OTP (mark as verified)
CREATE POLICY "Users can update own OTP" ON public.whatsapp_otp
FOR UPDATE USING (auth.uid() = user_id);

-- Index for fast lookup
CREATE INDEX idx_whatsapp_otp_phone_code ON public.whatsapp_otp(phone, code);
CREATE INDEX idx_whatsapp_otp_user_id ON public.whatsapp_otp(user_id);

-- Cleanup old OTPs (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_expired_otp()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.whatsapp_otp WHERE expires_at < now();
$$;
