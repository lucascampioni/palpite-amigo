
ALTER TABLE public.pool_transactions
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS asaas_qr_code text,
  ADD COLUMN IF NOT EXISTS asaas_qr_code_base64 text,
  ADD COLUMN IF NOT EXISTS asaas_invoice_url text;

CREATE INDEX IF NOT EXISTS idx_pool_transactions_asaas_payment_id
  ON public.pool_transactions(asaas_payment_id);

ALTER TABLE public.pool_payouts
  ADD COLUMN IF NOT EXISTS asaas_transfer_id text,
  ADD COLUMN IF NOT EXISTS asaas_status text;

CREATE INDEX IF NOT EXISTS idx_pool_payouts_asaas_transfer_id
  ON public.pool_payouts(asaas_transfer_id);
