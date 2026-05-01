## O que muda

Hoje a Taxa Delfos é descontada do **bolo total arrecadado** no fim do bolão (sai do prêmio/organizador). Vamos mudar para uma **taxa cobrada por cima** do valor de cada palpite, paga pelo participante no momento do PIX. O organizador e o vencedor passam a receber 100% sobre a entrada cheia, e a Delfos recebe a taxa diretamente do pagamento extra.

**Padrão**: 15% (atualmente está 5% no banco — vai virar 15%).

### Exemplo
- Entrada: R$ 10, prêmio: 80% do arrecadado, organizador: 20%
- 1 palpite → participante paga R$ 10 + R$ 1,50 = **R$ 11,50**
- 2 palpites → R$ 20 + R$ 3,00 = **R$ 23,00**
- O bolão considera só os R$ 10 (ou R$ 20) para premiação/organizador. R$ 1,50 (ou R$ 3,00) vai direto para a Delfos.

## Mudanças necessárias

**1. Frontend — cobrança PIX (`InAppPaymentSubmission` + `UserPoolEntries`)**
- Buscar `delfos_fee_percent` do `platform_settings`.
- Calcular `feeAmount = entryFee * fee%` e enviar `total = entryFee + feeAmount` para o `asaas-create-pix`.
- Mostrar para o usuário a quebra: "Entrada: R$ X · Taxa do app (15%): R$ Y · **Total: R$ Z**".

**2. Edge function `asaas-create-pix`**
- Recalcular a taxa no servidor (não confiar no cliente). Receber `entry_fee_total` (base) e calcular `fee` server-side.
- Cobrar `entry_fee_total + fee` no Asaas.
- Em `pool_transactions`, gravar **só o valor da entrada (base)** em `amount` — assim o cálculo de premiação/organizador continua correto. Adicionar duas colunas: `platform_fee` (valor cobrado da Delfos) e `gross_amount` (total cobrado).

**3. Edge function `asaas-process-payouts`**
- Remover o desconto da Taxa Delfos do `totalCollected`.
- `totalCollected` agora é só a soma das entradas (sem fee).
- Premiações e organizador são calculados em cima de `totalCollected` cheio.
- Payout da Delfos passa a vir da soma de `platform_fee` das transações aprovadas (registro `recipient_type = 'platform'`).

**4. UI do criador (`CreateFootballPool` / `EditFootballPool`)**
- Remover o aviso "🏛️ X% do valor arrecadado fica com o app (taxa Delfos, descontada automaticamente)".
- Remover a subtração da taxa do `organizerShare` no resumo de %.
- Adicionar nota informativa no campo de entrada do bolão: "💡 A taxa do app (15%) é cobrada do participante por cima da entrada — não afeta o valor da premiação ou da sua comissão."

**5. Painel admin (`AdminPlatformSettings`)**
- Atualizar texto: deixar de descrever como "% retida sobre o arrecadado" e passar a descrever como "% cobrado do participante por cima do valor de cada palpite (vai direto para a manutenção do app)".
- Atualizar o valor padrão no banco de 5% para 15%.

## Migração

```sql
-- Atualiza taxa padrão para 15%
UPDATE platform_settings SET value = '15'::jsonb WHERE key = 'delfos_fee_percent';

-- Novas colunas em pool_transactions
ALTER TABLE pool_transactions
  ADD COLUMN platform_fee numeric DEFAULT 0,
  ADD COLUMN gross_amount numeric;
```

`amount` continua sendo o valor da **entrada** (base). `gross_amount` é o que o usuário pagou de fato. `platform_fee` é a fatia da Delfos.

## Compatibilidade
- Bolões antigos com transações já pagas: `platform_fee = 0`, `gross_amount = amount`. Para esses, o `process-payouts` continua funcionando (Delfos = 0 no novo modelo, então o organizador recebe o valor que sobrou — mesmo comportamento de hoje, já que esses bolões já tiveram payouts processados ou ainda não chegaram lá).
- Para bolões em andamento, a próxima cobrança PIX já usa o novo modelo; cobranças anteriores não são afetadas.