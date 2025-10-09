-- Create enum for pool types
CREATE TYPE public.pool_type AS ENUM ('custom', 'football');

-- Create enum for measurement units
CREATE TYPE public.measurement_unit AS ENUM ('kg', 'cm', 'reais', 'units', 'score');

-- Create enum for pool status
CREATE TYPE public.pool_status AS ENUM ('draft', 'active', 'closed', 'finished');

-- Create enum for participant status
CREATE TYPE public.participant_status AS ENUM ('pending', 'approved', 'rejected');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create pools table
CREATE TABLE public.pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  pool_type public.pool_type NOT NULL DEFAULT 'custom',
  measurement_unit public.measurement_unit NOT NULL DEFAULT 'units',
  guess_label TEXT NOT NULL,
  status public.pool_status NOT NULL DEFAULT 'draft',
  deadline TIMESTAMPTZ NOT NULL,
  result_value TEXT,
  winner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create participants table
CREATE TABLE public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL,
  user_id UUID NOT NULL,
  participant_name TEXT NOT NULL,
  guess_value TEXT NOT NULL,
  status public.participant_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pool_id, user_id)
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Pools policies
CREATE POLICY "Anyone can view active pools"
  ON public.pools FOR SELECT
  USING (status IN ('active', 'finished'));

CREATE POLICY "Pool owners can view their pools"
  ON public.pools FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Authenticated users can create pools"
  ON public.pools FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Pool owners can update their pools"
  ON public.pools FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Pool owners can delete their pools"
  ON public.pools FOR DELETE
  USING (auth.uid() = owner_id);

-- Participants policies
CREATE POLICY "Pool owners can view all participants in their pools"
  ON public.participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pools
      WHERE pools.id = participants.pool_id
      AND pools.owner_id = auth.uid()
    )
  );

CREATE POLICY "Participants can view their own participation"
  ON public.participants FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can request to join pools"
  ON public.participants FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Pool owners can update participant status"
  ON public.participants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.pools
      WHERE pools.id = participants.pool_id
      AND pools.owner_id = auth.uid()
    )
  );

-- Create function to handle profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Usuário')
  );
  RETURN new;
END;
$$;

-- Create trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pools_updated_at
  BEFORE UPDATE ON public.pools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_participants_updated_at
  BEFORE UPDATE ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();