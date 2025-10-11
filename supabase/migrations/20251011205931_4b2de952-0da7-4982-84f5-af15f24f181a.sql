-- Add pix_key column to participants table
ALTER TABLE public.participants
ADD COLUMN participant_pix_key TEXT;

COMMENT ON COLUMN public.participants.participant_pix_key IS 'PIX key of the participant for receiving prize money (only visible to pool owner)';