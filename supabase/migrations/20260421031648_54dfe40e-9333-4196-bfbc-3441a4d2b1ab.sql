ALTER TABLE public.pool_transactions
  DROP COLUMN IF EXISTS mp_payment_id,
  DROP COLUMN IF EXISTS mp_qr_code,
  DROP COLUMN IF EXISTS mp_qr_code_base64,
  DROP COLUMN IF EXISTS mp_ticket_url;

ALTER TABLE public.pool_payouts
  DROP COLUMN IF EXISTS mp_transfer_id;