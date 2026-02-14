-- Allow admins to view all profiles (needed for WhatsApp phone numbers)
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (is_app_admin() OR is_user_admin());