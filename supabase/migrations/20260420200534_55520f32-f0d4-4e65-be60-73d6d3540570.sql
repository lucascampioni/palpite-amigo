UPDATE public.pool_payouts
SET status = 'pending_approval',
    failure_reason = NULL,
    raw_response = NULL,
    approved_by = NULL,
    approved_at = NULL
WHERE id = '10858da1-cb97-46c0-a0f8-c31c5c643df4';