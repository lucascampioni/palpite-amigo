UPDATE public.participants
SET prize_status = NULL, prize_sent_at = NULL
WHERE id = '3ccecc80-2f2f-4ad8-9221-bbab8450f9e4'
  AND pool_id = '9f5ac3bc-e298-41a1-ae0f-4b2046e8d9a1';

UPDATE public.pools
SET winner_id = (SELECT user_id FROM public.participants WHERE id = '0d71f0b2-2dbc-4743-ab59-80b54ca7dbcd')
WHERE id = '9f5ac3bc-e298-41a1-ae0f-4b2046e8d9a1';