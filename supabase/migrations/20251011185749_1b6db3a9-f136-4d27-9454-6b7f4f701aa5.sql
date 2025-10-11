-- Create a function to get user ID by email (admin only)
-- Since we can't query auth.users from client, we'll add a flag to pools table instead
ALTER TABLE public.pools 
ADD COLUMN is_official BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.pools.is_official IS 'Marks if this is an official pool created by app admin';

-- Create an RPC function to check if current user is app admin
CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE auth.users.id = auth.uid()
      AND auth.users.email = 'lukas.campioni@gmail.com'
  );
$$;