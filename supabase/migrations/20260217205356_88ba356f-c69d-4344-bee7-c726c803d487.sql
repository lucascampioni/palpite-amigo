
-- Add unique constraint on phone (NULLs are allowed for uniqueness)
CREATE UNIQUE INDEX profiles_phone_unique ON public.profiles (phone) WHERE phone IS NOT NULL;
