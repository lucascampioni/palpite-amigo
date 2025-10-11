-- Allow participants to update their own record to attach proof and move to pending
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'participants' AND policyname = 'Participants can upload proof and mark pending'
  ) THEN
    CREATE POLICY "Participants can upload proof and mark pending"
    ON participants
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (
      auth.uid() = user_id AND 
      status IN ('awaiting_proof','pending')
    );
  END IF;
END $$;