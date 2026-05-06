-- Corrige payouts do bolão "Semi da Champions" — havia empate de 1º lugar (2 ganhadores)
-- mas só 1 payout foi criado. Substitui pelo split correto entre os empatados.
DELETE FROM pool_payouts
WHERE id = 'd800bd9b-b025-4927-8607-5467cdc61139'
  AND status = 'pending_approval';

INSERT INTO pool_payouts (pool_id, recipient_user_id, recipient_type, pix_key, pix_key_type, amount, status, notes)
SELECT
  '0fee4ce5-2fd0-469b-9478-261d4419bf4e'::uuid,
  p.id,
  'winner',
  p.pix_key,
  p.pix_key_type,
  12.00,
  'pending_approval',
  'Empate 1º lugar (2 ganhadores): ' || COALESCE(part.participant_name, p.full_name)
FROM profiles p
JOIN participants part ON part.user_id = p.id AND part.pool_id = '0fee4ce5-2fd0-469b-9478-261d4419bf4e'
WHERE p.id IN (
  '20f6556c-6a28-45f8-b7fb-4b666ac4d395',
  'f5f2f0d5-a55c-407d-a614-818d298e02f4'
);