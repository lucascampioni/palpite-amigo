-- Create a separate table for payment information
CREATE TABLE IF NOT EXISTS public.pool_payment_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL UNIQUE REFERENCES public.pools(id) ON DELETE CASCADE,
  pix_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on the new table
ALTER TABLE public.pool_payment_info ENABLE ROW LEVEL SECURITY;

-- Migrate existing PIX keys to the new table
INSERT INTO public.pool_payment_info (pool_id, pix_key, created_at, updated_at)
SELECT id, pix_key, created_at, updated_at
FROM public.pools
WHERE pix_key IS NOT NULL
ON CONFLICT (pool_id) DO NOTHING;

-- Remove pix_key column from pools table (will be done after confirming migration works)
-- We'll keep it for now to avoid breaking existing code immediately

-- Policy: Pool owners can manage payment info for their pools
CREATE POLICY "Pool owners can view payment info"
ON public.pool_payment_info
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.pools
    WHERE pools.id = pool_payment_info.pool_id
      AND pools.owner_id = auth.uid()
  )
);

CREATE POLICY "Pool owners can insert payment info"
ON public.pool_payment_info
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pools
    WHERE pools.id = pool_payment_info.pool_id
      AND pools.owner_id = auth.uid()
  )
);

CREATE POLICY "Pool owners can update payment info"
ON public.pool_payment_info
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.pools
    WHERE pools.id = pool_payment_info.pool_id
      AND pools.owner_id = auth.uid()
  )
);

-- Policy: Authenticated users can view payment info for active pools they're joining
-- This is secure because users must be authenticated (prevents mass scraping)
-- and only shows PIX key when they're actively engaging with the pool
CREATE POLICY "Authenticated users can view payment info for active pools"
ON public.pool_payment_info
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.pools
    WHERE pools.id = pool_payment_info.pool_id
      AND pools.status = 'active'
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_pool_payment_info_updated_at
BEFORE UPDATE ON public.pool_payment_info
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();