
-- Atualizar o prize_status dos 3 ganhadores empatados em 1º lugar do Bolão #01
UPDATE participants
SET 
  prize_status = 'awaiting_pix',
  updated_at = now()
WHERE id IN (
  'b611bf96-2ce1-42e2-98d9-51b8b93a2b3a', -- Gustavo Cavalcante
  'e8489974-af45-433a-95f7-5e939aa06e7e', -- Iago Pires de Oliveira
  'a77f84df-4c98-4598-9ee6-5b7b9f3e1110'  -- Josepher Rodrigues Porto
);
