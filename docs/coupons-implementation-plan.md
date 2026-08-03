# Plano de Implementação — Cupons, Afiliados, Comissões e Preços

> Plano de execução da spec `docs/coupons-affiliates-pricing-spec.md`. Cobre os
> **dois repos**. Documento vivo — atualizar conforme as fases avançam.

## Objetivo e escopo

Implementar o programa completo do MD: cupons de afiliado, businesses, comissões,
motor de preço, PIX e RBAC — **começando limpo** (decisão #8 da spec, sem migrar o
modelo antigo de trial estendido).

Dois repos, **mesmo projeto Supabase** (`zgkxtyewmbkupuzeoyya`):

- **`tiktok-shop-tally`** (app principal) — schema/migrations, RLS, motor de preço,
  checkout, `subscriptions`, geração/estorno de comissão, billing (Asaas), crons.
- **`tiktally-backoffice`** (este) — os **3 painéis** (Admin/Business/Afiliado) e a
  edge function gateway `bo-coupons`.

## Modelo de comissão (regra vigente — 2026-08-03)

O pool de gestão é **30%**, dividido entre o desconto ao cliente e a comissão:

**`comissão % = 30% − desconto do cupom %`** — base: **valor PAGO (net)**,
decisão do produto.

| Cupom | Cliente paga (do tabela) | Comissão (% do pago) | Comissão (% do tabela) | TikTally efetivo |
|---|---|---|---|---|
| 10% | 90% | **20%** | 18,0% | **72,0%** |
| 15% | 85% | **15%** | 12,75% | **72,25%** |
| 20% | 80% | **10%** | 8,0% | **72,0%** |

⚠️ Como a base é o valor pago (e não o de tabela), a fatia efetiva da TikTally
fica em **~72%**, não exatamente 70%; e o **−5% do PIX reduz a comissão** na
mesma proporção (ex.: cupom 20% + PIX → comissão = 10% × 76% = 7,6% do tabela).

### ⚠️ Renovação (decisão travada — 2026-08-03)

**Renovação é sempre a PREÇO CHEIO e NÃO gera comissão.** O cupom vale só na
**1ª cobrança**. Isso *contraria* o MD §1 ("desconto permanente, aplicado também
nas renovações") — a decisão do produto prevalece. Consequência: `applies_to_renewals`
e `subscriptions.recurring_discount_percent` viraram **vestigiais** (não afetam
preço). `coupon_id` na subscription é mantido só como histórico da origem.

- Business escolhe entre **10 / 15 / 20%**. Cupom da **própria conta** (sem
  afiliado) = **máx. 10%**; com **afiliado da carteira** = até **20%**.
- **Um cupom pertence a UM único afiliado** (decisão travada — sem rateio).
- Comissão vai pro afiliado; se o cupom for da conta do business, vai pro
  **business** (`commissions.affiliate_id` nullable + CHECK de destinatário).
- `affiliates.default_commission_type/value` virou **legado**.

## Decisões travadas

| # | Decisão | Implicação |
|---|---|---|
| 1 | **Preços = os do MD** | Aumento real vs. produção (Pro anual R$ 5.988 vs R$ 2.988; Plus anual R$ 7.188 vs R$ 3.588). Seed em `prices`; valem só p/ novas assinaturas. Remove hardcode. |
| 2 | **Renomear `erp` → `plus`** | Altera CHECK de `subscriptions.plan`/`billings.plan`, migra registros `erp`→`plus`, ajusta config/front/backoffice. |
| 3 | **3 painéis no backoffice** | Gate deixa de ser só `is_admin`: gateway `bo-coupons` vira **role-aware** com escopo server-side por papel + PII mascarada (LGPD). Nunca cross-tenant p/ business/afiliado. |
| 4 | **DB local-first + migrations aditivas** | `supabase start`, migrations idempotentes; prod só com ok. |

## Progresso

- ✅ **Fase 1 — schema**: migrations **1–4 APLICADAS e verificadas em produção** (`zgkxtyewmbkupuzeoyya`, via MCP). `settings/plans/prices`(+seed conferido), `businesses/affiliates`, `commissions/audit_logs` criadas; `coupons/coupon_redemptions/subscriptions` estendidas. Migration **5 (rename `erp→plus`) NÃO aplicada** — vai junto com o code-rename.
- ✅ **Fase 2 — motor de preço**: função pública `pricing` **deployada e testada AO VIVO** — a matriz bate 100% com o MD §2 (Pro anual cupom+PIX R$4.550,88; Plus semestral cupom+PIX R$3.187,44; etc.). Puro em `_shared/pricing/engine.ts`; deploy como bundle self-contained.
- ✅ **Fase 5 — backoffice Admin**: gateway `bo-coupons` expandido (+14 ações: preços/settings, afiliados, businesses, comissões, auditoria) **deployado** no `zgkxtyewmbkupuzeoyya`; telas Planos&Preços, Afiliados, Businesses, Comissões + seletor de afiliado no form de cupom, **verificadas no preview** (typecheck limpo, sem erro de console). Admin-only; role-aware de business/afiliado fica pra Fase 6.
- ✅ **Fase 3 — checkout + comissão** (código escrito, **NÃO deployado**): `_shared/asaas/coupons.ts` (`recordAffiliateCommission` + `getSettingNumber`); `billing-create-payment` (−5% PIX à vista pra todos, anti-fraude de afiliado, `subscription.coupon_id`/`recurring_discount_percent`, comissão no 1º pgto); `billing-create-subscription` (idem + recorrência Asaas cobra com desconto vitalício); `asaas-webhook-receiver` (comissão no caminho assíncrono + desconto vitalício na recorrência pós-confirmação); `UpgradePage` (`?cupom=` auto-aplica). Front typecheck limpo.
- ⚠️ **Efeito ao vivo do deploy**: como **não há afiliado/cupom-de-afiliado em prod ainda**, toda a máquina de afiliado/comissão nasce **dormente**. A ÚNICA mudança para clientes atuais é o **−5% PIX à vista**.
- ⬜ **Próximo**: deploy das 3 functions de pagamento (com ok do usuário) → Fase 6 (painéis Business/Afiliado role-aware) → rename `erp→plus` final.

## Estado atual × alvo (resumo dos scouts)

**Já existe e reusar:** `coupons` + `coupon_redemptions` + RPC `increment_coupon_redeems`;
validação server-side de cupom (`_shared/asaas/coupons.ts`); aplicação de desconto
PERCENTAGE/FIXED em `billing-create-payment`/`billing-create-subscription`;
`billings`/`subscriptions` com `discount_cents`/`coupon_code`/`original_amount_cents`;
webhook Asaas já trata refund/chargeback → `billings.status`; padrão de cron
(pg_cron + pg_net + `x-cron-secret`); e-mail via Resend; RLS `is_admin_user()` /
`effective_user_id()` (SECURITY DEFINER), tabelas de billing deny-by-default + service_role.

**Greenfield (não existe):** tabelas `plans`, `prices`, `settings`, `businesses`,
`affiliates`, `commissions`, `audit_logs`; motor `GET /pricing`; desconto PIX +5% e
empilhamento ×0,76; `?cupom=` no link/checkout; unicidade vitalícia de cupom por
usuário; snapshots ricos em `coupon_redemptions`; `subscriptions.coupon_id` /
`recurring_discount_percent`; comissão + `eligible_at=+7d` + job de promoção;
RBAC de 3 papéis; convites por e-mail com role; trial automático de 7 dias no signup.

## Fases

### Fase 1 — Schema + RBAC · `[app principal]` (migrations)
- Criar `plans`, `prices`, `settings`, `businesses`, `affiliates`, `commissions`, `audit_logs`.
- Estender `coupons`: `affiliate_id`, `business_id`, `applies_to_renewals`, `notes`, status de 4 estados (`active|paused|expired|archived` — mapear a partir de `ACTIVE/INACTIVE`).
- Estender `coupon_redemptions`: `affiliate_id`, `business_id`, `plan_key`, `cycle`, `discount_percent_applied`, `payment_method`, `pix_discount_applied`, `gross_amount`, `net_amount`, `status`, unicidade vitalícia por usuário.
- Estender `subscriptions`: `coupon_id`, `recurring_discount_percent`.
- **Rename `erp`→`plus`**: CHECK constraints + UPDATE dos registros existentes.
- RBAC: modelo de papel (ver "Decisões de schema em aberto") + helpers RLS (`is_business_user`, `affiliate_id_of`, …) no padrão `is_admin_user()`.
- Seed: `settings` (coupon 20, pix 5, multiplicative, hold 7), `plans` (pro, plus), `prices` (números do MD).

### Fase 2 — Motor de preço `GET /pricing` · `[app principal]` (edge function)
- Fonte única: 4 combinações (cheio, cupom, PIX, cupom+PIX) × planos/ciclos, lendo `plans`/`prices`/`settings`. Regra de arredondamento: 2 casas, **round half-up** (definir e testar).
- Front e `config.ts` deixam de ler preço hardcoded — consomem o motor.

### Fase 3 — Checkout com cupom + comissão · `[app principal]`
- `?cupom=CODIGO` capturado na `UpgradePage`; aplicar −20% + PIX −5% (à vista) via motor.
- Estender `billing-create-*`: unicidade vitalícia; snapshot rico em `coupon_redemptions`; `subscription.coupon_id`/`recurring_discount_percent`; gerar `commission` (`pending`, `eligible_at = paid_at + 7d`) **só no 1º pagamento**.
- Anti-fraude: usuário ≠ afiliado dono; afiliado/business `active`.

### Fase 4 — Renovação + refund/estorno + jobs · `[app principal]`
- Renovação aplica `recurring_discount_percent` persistido (sem revalidar cupom); cupom expirado/pausado não afeta quem já assinou.
- Webhook Asaas: refund na janela → redemption `refunded` + comissão `cancelled`; chargeback pós-pagamento → comissão `reversed`.
- Cron promove comissão `pending`→`eligible` após 7d (reusa pg_cron+pg_net+Vault).
- Churn: retorno não recupera desconto.

### Fase 5 — Painel Admin · `[backoffice]` (estende `bo-coupons`)
- Actions + telas: Planos/Preços (auditado), Cupons full CRUD (todos os campos), Businesses, Afiliados, Comissões (fila `pending`/`eligible`, aprovar/pagar/estornar), Histórico global + export CSV, métricas (funil com/sem cupom, rankings).

### Fase 6 — Painéis Business & Afiliado · `[backoffice, role-aware]`
- **Business**: visão da carteira, CRUD de afiliados (limitado), cupons CRUD limitado (`%` travado 20), histórico + CSV, assinantes mascarados. Não aprova/paga comissão.
- **Afiliado**: visão geral, meu cupom (read-only), histórico (mascarado), minhas comissões + editar chave PIX.
- Gate role-aware na gateway + `LoginPage` roteia por papel + escopo server-side + máscara LGPD.

### Fase 7 — Auditoria, exports, métricas comparativas · `[ambos]`
- `audit_logs` nas ações sensíveis; exports CSV; funil com/sem cupom.

### Fase 8 — Testes-chave · `[ambos]`
Matriz de preços completa; arredondamento (round half-up, 2 casas); unicidade
vitalícia; desconto persistente na renovação com cupom expirado; churn sem
recuperação; comissão não-elegível antes de 7d; escopo de dados por role;
permissões de edição do business.

## Decisões de schema em aberto (confirmar na Fase 1)

1. **Modelo de papel.** Proposta: `affiliates.user_id` / `businesses.owner_user_id` (spec) + um `profiles.role` explícito (`business|affiliate`, null p/ seller comum; `is_admin` continua ortogonal) + helpers RLS. Alternativa: derivar o papel da existência de linha em `affiliates`/`businesses`.
2. **Unicidade vitalícia × dados existentes.** `coupon_redemptions` já tem linhas em prod → um `UNIQUE(user_id)` global quebraria. Proposta: índice único **parcial**, só para resgates ligados a afiliado (`WHERE affiliate_id IS NOT NULL`), preservando os resgates de desconto/trial atuais.
3. **`net_amount` p/ comissão.** A Asaas manda `netValue` no webhook mas não é gravado hoje. Capturar no `payment-confirmed` para basear a comissão no líquido.
4. **Status do cupom.** Migrar `ACTIVE/INACTIVE` (texto) → enum de 4 estados sem quebrar a validação atual (`billing-validate-coupon` trata `ACTIVE`).

## Estratégia de DB e verificação

- **Dev local**: `supabase start` no app principal; migrations idempotentes por timestamp em `supabase/migrations/`; testar; `apply_migration`/`db push` em prod **só com ok**.
- **Backoffice**: preview via `VITE_DEV_PREVIEW=true` (mock) e dev server (`launch.json` → `backoffice`, porta 8090). Typecheck `npm run typecheck`.
- **Deploy functions** (quando pedido): `supabase functions deploy <slug> --project-ref zgkxtyewmbkupuzeoyya`.

## Ponto de atenção de segurança (decisão #3)

Com os 3 painéis no backoffice, o antigo gate "só `is_admin`" **não basta**. Regra
inegociável: business e afiliado **nunca** enxergam dados fora do seu escopo. Todo
filtro é server-side na `bo-coupons` (por `business_id`/`affiliate_id` derivados do
usuário autenticado, nunca de parâmetro vindo do front); PII de assinante mascarada
para não-admin; ações sensíveis em `audit_logs`.
