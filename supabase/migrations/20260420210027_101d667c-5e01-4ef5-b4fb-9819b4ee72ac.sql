UPDATE public.pool_payouts
SET status = 'pending_approval',
    failure_reason = NULL,
    mp_transfer_id = NULL,
    asaas_transfer_id = NULL,
    asaas_status = NULL,
    sent_at = NULL,
    approved_at = NULL,
    approved_by = NULL
WHERE status IN ('failed', 'approved')
  AND sent_at IS NULL;