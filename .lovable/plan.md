## Sistema de Indicação para Bolões Oficiais

### Objetivo
Permitir que participantes de bolões com **premiação fixa** da comunidade **Delfos Oficial** indiquem outras pessoas. Quando o indicado entrar e pagar, o indicador ganha **1 palpite extra grátis** no mesmo bolão.

### Critérios de elegibilidade do bolão
- `prize_type = 'fixed'`
- Pool pertence à comunidade Delfos Oficial (owner_id = responsible_user_id da `communities.is_official=true`)
- Status = `active`

### Fluxo
1. **Após o usuário ter pelo menos 1 palpite aprovado** no bolão elegível, exibir um **card grande em destaque** dentro do `UserPoolEntries`:
   - Texto: "🎁 Indique e ganhe 1 palpite grátis! Para cada amigo que entrar pelo seu link e pagar, você ganha um palpite extra automaticamente."
   - Link copiável: `https://delfos.app.br/bolao/<slug>?ref=<user_id>`
   - Botões: Copiar link, Compartilhar (WhatsApp).
   - Mostrar contador: "X amigos indicados • Y palpites grátis ganhos".

2. **Captura do referral**: ao abrir `/bolao/<slug>?ref=<id>`, salvar em `localStorage` (`referral_<poolId>=<id>`) e `sessionStorage`. Persiste mesmo se fizer login/cadastro depois.

3. **Registro do referral**: ao criar um participante (`FootballPredictionForm.handleConfirmSubmit`), se houver `referral_<poolId>` no storage e o referrer ≠ self e o pool for elegível, inserir registro em `pool_referrals` com `status='pending'` e `referred_participant_id`.

4. **Conversão**: edge function `process-referral-rewards` (chamada após webhook Asaas aprovar OU após approve manual) verifica:
   - Indicado tem participante `approved` no pool
   - Pool elegível
   - Indicador também está `approved` no pool
   Se sim:
   - Cria novo participante para o referrer: `status='approved'`, `guess_value='Indicação grátis'`, `payment_proof='referral_reward:<referred_user_id>'`
   - Atualiza `pool_referrals.status='rewarded'`, `rewarded_participant_id`
   - Envia notificação push/WhatsApp ao referrer

5. **Preenchimento do palpite ganho**: O participante "approved sem predictions" (criado pela recompensa) aparecerá como uma entrada que precisa preencher palpites. Estender lógica do `UserPoolEntries`/`FootballPredictionForm` (hoje só trata `estabelecimento`) para também tratar `payment_proof LIKE 'referral_reward%'` da mesma forma — mostrar formulário de palpite, sem cobrança.

### Mudanças técnicas

**Banco** (migration):
- Tabela `pool_referrals`: `id, pool_id, referrer_user_id, referred_user_id, referred_participant_id, reward_participant_id, status (pending|rewarded|cancelled), created_at, rewarded_at`. Unique `(pool_id, referred_user_id)`. RLS: usuário lê os próprios (como referrer ou referred); pool owner lê do seu pool; admins.
- Função `is_pool_referral_eligible(pool_id)` SECURITY DEFINER que valida prize_type=fixed + owner pertence a community oficial.

**Edge function** `process-referral-rewards/index.ts`:
- Input: `{ pool_id, referred_user_id }`
- Lógica acima usando service role.
- Disparada por:
  - `asaas-webhook` após aprovar participantes (loop sobre participantIds)
  - `admin-actions` / approval manual (encontrar onde aprovação manual ocorre — provavelmente em `AdminPendingParticipants` ou owner approval)

**Frontend**:
- `src/lib/referral.ts`: helpers `captureReferral(poolId)`, `getReferral(poolId)`, `clearReferral(poolId)`.
- `PoolDetail.tsx`: chamar `captureReferral` no mount usando `searchParams.ref`.
- `FootballPredictionForm.tsx`: após criar participant, inserir em `pool_referrals` se aplicável.
- `UserPoolEntries.tsx`: adicionar `<ReferralCard />` em destaque quando `approved.length > 0` e pool elegível.
- Novo componente `ReferralCard.tsx`: link, copiar, share, contador (consulta `pool_referrals`).
- Estender lógica de "approved sem predictions" para tratar `payment_proof LIKE 'referral_reward%'` (usar form sem cobrança).

### Observações
- Recompensa é dada **uma vez por indicado** (não por cada palpite que o indicado fizer).
- Se o referido cancelar/for refundado, opcionalmente cancelar a recompensa (out of scope inicial — manter simples).
- Pools sem entry_fee: não há "pagar", então qualquer aprovação conta como conversão.
