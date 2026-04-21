UPDATE public.pool_transactions
SET mp_payment_id = NULL, asaas_payment_id = NULL
WHERE status = 'cancelled'
  AND (mp_payment_id IS NOT NULL OR asaas_payment_id IS NOT NULL);