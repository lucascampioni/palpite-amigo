-- Fix: Allow app admins (email-based) to also view all user roles
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
  ON public.user_roles
  FOR SELECT
  USING (is_user_admin() OR is_app_admin());