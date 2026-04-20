-- Platform fee
INSERT INTO public.pool_payouts (pool_id, recipient_user_id, recipient_type, amount, status, notes)
VALUES ('9efad95c-f8f2-4cb4-8d50-586b9e799538', NULL, 'platform', 1.50, 'pending_approval', 'Taxa Delfos 5% sobre R$ 30.00');

-- Winner (1º lugar) - busca o vencedor pelo ranking
INSERT INTO public.pool_payouts (pool_id, recipient_user_id, recipient_type, pix_key, pix_key_type, amount, status, notes)
SELECT
  '9efad95c-f8f2-4cb4-8d50-586b9e799538'::uuid,
  r.user_id,
  'winner',
  pr.pix_key,
  pr.pix_key_type,
  24.00,
  'pending_approval',
  '1º lugar: ' || r.participant_name
FROM public.get_football_pool_ranking('9efad95c-f8f2-4cb4-8d50-586b9e799538'::uuid) r
LEFT JOIN public.profiles pr ON pr.id = r.user_id
ORDER BY r.total_points DESC
LIMIT 1;

-- Organizer
INSERT INTO public.pool_payouts (pool_id, recipient_user_id, recipient_type, pix_key, pix_key_type, amount, status, notes)
SELECT
  '9efad95c-f8f2-4cb4-8d50-586b9e799538'::uuid,
  p.owner_id,
  'organizer',
  pr.pix_key,
  pr.pix_key_type,
  4.50,
  'pending_approval',
  'Comissão organizador (' || COALESCE(pr.full_name,'') || ')'
FROM public.pools p
LEFT JOIN public.profiles pr ON pr.id = p.owner_id
WHERE p.id = '9efad95c-f8f2-4cb4-8d50-586b9e799538';