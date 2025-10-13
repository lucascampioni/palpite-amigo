-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.is_user_admin());

CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.is_user_admin());

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.is_user_admin());

-- Add prize-related columns to participants table
ALTER TABLE public.participants
ADD COLUMN prize_status TEXT DEFAULT NULL CHECK (prize_status IN ('awaiting_pix', 'pix_submitted', 'prize_sent')),
ADD COLUMN prize_pix_key TEXT DEFAULT NULL,
ADD COLUMN prize_pix_key_type TEXT DEFAULT NULL,
ADD COLUMN prize_proof_url TEXT DEFAULT NULL,
ADD COLUMN prize_submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN prize_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Update RLS policies for pools to restrict creation to admins only
DROP POLICY IF EXISTS "Authenticated users can create pools" ON public.pools;

CREATE POLICY "Only admins can create pools"
ON public.pools
FOR INSERT
TO authenticated
WITH CHECK (public.is_user_admin());

CREATE POLICY "Only admins can update pools"
ON public.pools
FOR UPDATE
TO authenticated
USING (public.is_user_admin());

CREATE POLICY "Only admins can delete pools"
ON public.pools
FOR DELETE
TO authenticated
USING (public.is_user_admin());

-- Update participants policies to allow simpler joining (no payment proof required initially)
DROP POLICY IF EXISTS "Users can request to join pools" ON public.participants;
DROP POLICY IF EXISTS "Participants can upload proof and mark pending" ON public.participants;

CREATE POLICY "Users can join pools"
ON public.participants
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Participants can update own data"
ON public.participants
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can update all participants"
ON public.participants
FOR UPDATE
TO authenticated
USING (public.is_user_admin());

-- Create trigger to automatically assign 'user' role to new users
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user'::app_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_assign_role
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_role();