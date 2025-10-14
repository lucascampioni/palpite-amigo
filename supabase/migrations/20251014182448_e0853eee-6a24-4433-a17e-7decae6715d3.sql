-- Add finished_at column to pools table
ALTER TABLE public.pools 
ADD COLUMN finished_at TIMESTAMP WITH TIME ZONE;

-- Create or replace trigger function to set finished_at when status changes to finished
CREATE OR REPLACE FUNCTION public.set_finished_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If status is being changed to 'finished' and finished_at is not already set
  IF NEW.status = 'finished' AND OLD.status != 'finished' AND NEW.finished_at IS NULL THEN
    NEW.finished_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically set finished_at
DROP TRIGGER IF EXISTS set_pool_finished_at ON public.pools;
CREATE TRIGGER set_pool_finished_at
  BEFORE UPDATE ON public.pools
  FOR EACH ROW
  EXECUTE FUNCTION public.set_finished_at();

-- Update existing finished pools to set their finished_at to updated_at
UPDATE public.pools 
SET finished_at = updated_at 
WHERE status = 'finished' AND finished_at IS NULL;