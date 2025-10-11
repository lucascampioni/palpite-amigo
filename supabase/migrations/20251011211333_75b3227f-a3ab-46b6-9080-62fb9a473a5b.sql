-- Add PIX key type and consent fields to participants table
ALTER TABLE public.participants 
ADD COLUMN IF NOT EXISTS pix_key_type text,
ADD COLUMN IF NOT EXISTS pix_consent boolean DEFAULT false;

-- Create audit log table for PIX key access
CREATE TABLE IF NOT EXISTS public.pix_key_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  accessed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pool_id uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  accessed_at timestamp with time zone NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);

-- Enable RLS on audit logs
ALTER TABLE public.pix_key_access_logs ENABLE ROW LEVEL SECURITY;

-- Pool owners can insert logs
CREATE POLICY "Pool owners can insert access logs"
ON public.pix_key_access_logs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pools
    WHERE pools.id = pix_key_access_logs.pool_id
    AND pools.owner_id = auth.uid()
  )
);

-- Pool owners can view logs for their pools
CREATE POLICY "Pool owners can view access logs"
ON public.pix_key_access_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.pools
    WHERE pools.id = pix_key_access_logs.pool_id
    AND pools.owner_id = auth.uid()
  )
);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_pix_access_logs_pool_id ON public.pix_key_access_logs(pool_id);
CREATE INDEX IF NOT EXISTS idx_pix_access_logs_participant_id ON public.pix_key_access_logs(participant_id);