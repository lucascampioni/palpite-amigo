
-- Update pools RLS to allow estabelecimento users to manage their pools
DROP POLICY IF EXISTS "Admins and pool creators can update pools" ON pools;
CREATE POLICY "Admins and pool creators can update pools" ON pools
FOR UPDATE USING (
  is_app_admin() OR (
    auth.uid() = owner_id AND (
      has_role(auth.uid(), 'pool_creator'::app_role) OR
      has_role(auth.uid(), 'estabelecimento'::app_role)
    )
  )
);

DROP POLICY IF EXISTS "Admins and pool creators can delete pools" ON pools;
CREATE POLICY "Admins and pool creators can delete pools" ON pools
FOR DELETE USING (
  is_app_admin() OR (
    auth.uid() = owner_id AND (
      has_role(auth.uid(), 'pool_creator'::app_role) OR
      has_role(auth.uid(), 'estabelecimento'::app_role)
    )
  )
);
