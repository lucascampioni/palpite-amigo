-- Update RLS policy to allow users to request to join pools with awaiting_proof status
DROP POLICY IF EXISTS "Users can request to join pools" ON participants;

CREATE POLICY "Users can request to join pools" 
ON participants 
FOR INSERT 
TO authenticated
WITH CHECK (
  auth.uid() = user_id AND 
  (status = 'pending' OR status = 'awaiting_proof')
);