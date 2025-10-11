-- Add new status for participant awaiting payment proof
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid  
    WHERE t.typname = 'participant_status' 
    AND e.enumlabel = 'awaiting_proof'
  ) THEN
    ALTER TYPE participant_status ADD VALUE 'awaiting_proof';
  END IF;
END $$;