
## Objetivo

1. Garantir que o campo "código de indicação" apareça também ao usar **"Fazer mais palpites"**, e não só na primeira inscrição.
2. Recompensa proporcional: quando alguém usa o código do Lucas e envia **N palpites**, Lucas ganha **N créditos** de palpite grátis (e não apenas 1).
3. No formulário de envio do Lucas, mostrar quantos créditos ele tem disponíveis, quantos palpites do envio atual serão cobertos pelos créditos e quanto ele ainda terá que pagar.

## Mudanças no banco

Nova tabela `referral_credits` (1 linha = 1 crédito de palpite grátis):
- `id`, `user_id` (dono do crédito), `pool_id` (bolão onde pode ser usado), `source_referral_id` (FK para `pool_referrals`), `consumed_at`, `consumed_participant_id`, `created_at`.
- RLS: usuário lê seus próprios créditos; admins gerenciam.

Função SQL `count_available_referral_credits(p_user_id, p_pool_id)` retornando quantidade não consumida.

Atualização da `pool_referrals.status` para suportar `partial` (caso só parte dos créditos foram consumidos) — opcional; pode-se manter `pending`/`rewarded` controlando pelos créditos.

## Mudanças no edge function `process-referral-rewards`

- Em vez de criar 1 participante de recompensa, **inserir N linhas em `referral_credits`** onde N = nº de prediction_sets do indicado.
- Marcar referral como `rewarded` (e gravar `referred_participant_id` + `rewarded_at`).
- Remover lógica de criar participante "gratuito" antecipado (não mais necessário; créditos são consumidos no momento do envio).

## Mudanças no `FootballPredictionForm.tsx`

- Carregar `availableCredits` via consulta a `referral_credits` (não consumidos) no mount.
- Exibir o card de "código de indicação" **sempre que `canEnterReferral` for true**, inclusive em "Fazer mais palpites" (já é, mas vamos garantir que o useEffect roda novamente — `userId` está nas dependências).
- Calcular:
  - `paidSets = max(0, predictionSets.length - availableCredits)`
  - `freeSets = min(predictionSets.length, availableCredits)`
  - `totalFee = paidSets * feePerSet`
- Mostrar no resumo: `🎁 X palpite(s) grátis usado(s) · 💰 Y a pagar`.
- No `handleConfirmSubmit`:
  - Após criar `participant` e `predictions`, consumir `freeSets` créditos (UPDATE em `referral_credits` setando `consumed_at` e `consumed_participant_id`).
  - Se `paidSets === 0`, criar o participant já como `approved` e pular fluxo de pagamento.
  - Se `paidSets > 0`, manter fluxo de pagamento mas com `entryFee = paidSets * feePerSet`.

## Mudanças no `ReferralCard.tsx`

Atualizar contagem para mostrar créditos disponíveis baseados em `referral_credits` em vez do antigo `participants` "referral_reward".

## Mudanças no `UserPoolEntries.tsx`

Remover bloco do "voucher gratuito" (recompensa de indicação) — não existe mais participante de recompensa. Se o usuário tem créditos, eles aparecem no formulário normal.

## Migração de dados existentes

Para os atuais participantes "referral_reward" sem palpites, converter em linhas equivalentes em `referral_credits` (1 crédito por participante) e excluir o participante.

## Arquivos afetados

- `supabase/migrations/...sql` (nova tabela, função, migração de dados)
- `supabase/functions/process-referral-rewards/index.ts`
- `src/components/FootballPredictionForm.tsx`
- `src/components/ReferralCard.tsx`
- `src/components/UserPoolEntries.tsx`
- `src/integrations/supabase/types.ts` (auto)

Confirma para eu seguir?
