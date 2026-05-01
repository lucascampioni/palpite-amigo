ALTER TABLE public.pool_transactions
  ADD COLUMN IF NOT EXISTS platform_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_amount numeric;

UPDATE public.pool_transactions SET gross_amount = amount WHERE gross_amount IS NULL;