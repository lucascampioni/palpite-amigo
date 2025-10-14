-- Update RLS policies for pools to only allow app admin (lukas.campioni@gmail.com)
DROP POLICY IF EXISTS "Only admins can create pools" ON pools;
DROP POLICY IF EXISTS "Only admins can update pools" ON pools;
DROP POLICY IF EXISTS "Only admins can delete pools" ON pools;

CREATE POLICY "Only app admin can create pools"
ON pools
FOR INSERT
TO authenticated
WITH CHECK (is_app_admin());

CREATE POLICY "Only app admin can update pools"
ON pools
FOR UPDATE
TO authenticated
USING (is_app_admin());

CREATE POLICY "Only app admin can delete pools"
ON pools
FOR DELETE
TO authenticated
USING (is_app_admin());