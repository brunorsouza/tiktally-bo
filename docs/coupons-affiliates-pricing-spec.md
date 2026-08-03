# TikTally — Dashboard de Gestão de Cupons, Afiliados e Preços

> Documento de instruções para implementação do módulo de cupons do TikTally (tiktally.com.br). **v3 — decisões fechadas.** Serve como especificação para desenvolvimento (humano ou assistido por IA, ex.: Claude Code).

---

## 1. Contexto e Objetivo (regra vigente)

- **Sem cupom**: usuário tem **7 dias grátis** de trial e depois paga o **preço cheio**.
- **Com cupom**: usuário assina e **paga na hora** com **20% de desconto**, permanente e aplicado também nas renovações. Usuário em trial pode aplicar o cupom no checkout a qualquer momento — o cupom elimina a *necessidade* do trial, não o direito a ele.
- **PIX**: **+5% de desconto** adicional, válido **apenas para pagamento à vista do ciclo**. Parcelamento (12x/6x) é exclusivo do cartão.
- **Empilhamento multiplicativo**: `preço × 0,80 × 0,95 = ×0,76` (24% de desconto total com cupom + PIX).

Três painéis:

1. **Admin** — gerencia tudo: cupons, afiliados, businesses, preços/percentuais, histórico global e comissões.
2. **Business** — gerencia os afiliados e cupons da própria carteira (ex.: agência/parceiro).
3. **Afiliado** — acompanha o desempenho do próprio cupom: usos, assinaturas geradas e comissões.

---

## 2. Tabela de Preços

### Preço cheio — cartão parcelado

| Plano | Ciclo | Parcela | Total do ciclo |
|---|---|---|---|
| Pro | Anual (12x) | R$ 499,00 | R$ 5.988,00 |
| Plus (antigo ERP) | Anual (12x) | R$ 599,00 | R$ 7.188,00 |
| Pro | Semestral (6x) | R$ 599,00 | R$ 3.594,00 |
| Plus (antigo ERP) | Semestral (6x) | R$ 699,00 | R$ 4.194,00 |

### Com cupom (−20%) — cartão parcelado

| Plano | Ciclo | Parcela com cupom | Total do ciclo |
|---|---|---|---|
| Pro | Anual (12x) | R$ 399,20 | R$ 4.790,40 |
| Plus | Anual (12x) | R$ 479,20 | R$ 5.750,40 |
| Pro | Semestral (6x) | R$ 479,20 | R$ 2.875,20 |
| Plus | Semestral (6x) | R$ 559,20 | R$ 3.355,20 |

### PIX — somente à vista (total do ciclo)

| Plano | Ciclo | Só PIX (×0,95) | Cupom + PIX (×0,76) |
|---|---|---|---|
| Pro | Anual | R$ 5.688,60 | R$ 4.550,88 |
| Plus | Anual | R$ 6.828,60 | R$ 5.462,88 |
| Pro | Semestral | R$ 3.414,30 | R$ 2.731,44 |
| Plus | Semestral | R$ 3.984,30 | R$ 3.187,44 |

> Preços e percentuais **não devem ser hardcoded**: ficam em `plans`/`prices` + `settings` (`coupon_discount_percent = 20`, `pix_discount_percent = 5`, `discount_stacking = multiplicative`), editáveis pelo Admin com auditoria. O motor de preço (`GET /pricing`) é a fonte única de verdade para checkout e painéis.

---

## 3. Perfis e Permissões (RBAC)

Três roles: `admin` > `business` > `affiliate`.

| Capacidade | Admin | Business | Afiliado |
|---|---|---|---|
| Visão geral do programa (todos os cupons) | ✅ | ❌ (só da carteira) | ❌ |
| Gerenciar planos, preços e % de desconto | ✅ | ❌ | ❌ |
| Criar / editar / desativar businesses | ✅ | ❌ | ❌ |
| Criar / editar afiliados | ✅ | ✅ (só na carteira) | ❌ |
| CRUD de cupons | ✅ (todos os campos) | ✅ (carteira; campos limitados) | ❌ |
| Alterar % de desconto de um cupom | ✅ | ❌ (travado em 20%) | ❌ |
| Histórico de usos | ✅ (global) | ✅ (carteira) | ✅ (próprio) |
| Configurar regra de comissão | ✅ | ❌ | ❌ |
| Aprovar / pagar / estornar comissões | ✅ | ❌ | ❌ |
| Ver extrato de comissões | ✅ (todos) | ✅ (carteira) | ✅ (próprias) |
| Editar dados de recebimento (PIX) | ✅ | ✅ (da carteira) | ✅ (próprios) |

**Campos de cupom editáveis pelo Business** (definido): `code`, `max_redemptions`, `starts_at`/`expires_at`, `status` (pausar/reativar), `notes`. **Travados**: `discount_percent` (20%), `applies_to_renewals`, `affiliate_id` fora da carteira.

Regras de segurança:

- Filtros sempre server-side: business por `business_id`, afiliado por `affiliate_id`. Em Supabase/Postgres, **RLS** com policies por `auth.uid()` e claims de role.
- Afiliado e business veem dados **mascarados** dos assinantes (ex.: `jo***@gmail.com`) — LGPD, minimização.
- Ações sensíveis (alterar preço/percentual, arquivar cupom, pagar/estornar comissão) registram em `audit_logs`.

---

## 4. Modelo de Dados (sugestão)

Assumido Postgres/Supabase; adaptar ao stack real. **Sem migração de dados do modelo antigo** (trial estendido) — começar limpo.

### `plans` / `prices` / `settings`
- `plans`: `id, key (pro | plus), name, status`
- `prices`: `id, plan_id, cycle (annual | semiannual), installments (12 | 6), installment_amount, total_amount, active, created_at`
- `settings`: `coupon_discount_percent = 20`, `pix_discount_percent = 5`, `discount_stacking = multiplicative`, `commission_hold_days = 7`

### `businesses`
`id, owner_user_id FK→users, name, email, status (active|suspended), created_at, updated_at`

### `affiliates`
`id, user_id FK→users, business_id FK→businesses NULLABLE (null = independente, gerido pelo admin), name, email, pix_key, status (active|suspended), default_commission_type (fixed|percent), default_commission_value, created_at, updated_at`

### `coupons`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| code | text UNIQUE | armazenar UPPER, comparação case-insensitive |
| affiliate_id | uuid FK, nullable | permite cupom "da casa" |
| discount_percent | numeric, default 20 | editável só pelo admin |
| applies_to_renewals | boolean, default true | desconto vitalício nas renovações |
| max_redemptions | int nullable | |
| redemptions_count | int default 0 | |
| starts_at / expires_at | timestamptz nullable | validade para **novos usos**; não afeta assinaturas já criadas |
| status | enum: `active`, `paused`, `expired`, `archived` | soft delete; nunca hard delete com redemptions |
| notes | text | |

### `coupon_redemptions`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| coupon_id / affiliate_id / business_id | uuid FK | snapshots no momento do uso |
| redeemed_by_user_id | uuid FK → users | **UNIQUE — 1 cupom por usuário, vitalício** |
| subscription_id | uuid FK → subscriptions | |
| plan_key / cycle | snapshot | |
| discount_percent_applied | numeric | snapshot (20) |
| payment_method | enum: `card_installments`, `pix_upfront` | |
| pix_discount_applied | boolean | true somente em `pix_upfront` |
| gross_amount / net_amount | numeric | preço cheio × valor efetivamente pago |
| redeemed_at | timestamptz | |
| status | enum: `active`, `cancelled`, `refunded` | |

### `subscriptions` (integração com billing existente)
Guarda `coupon_id` e `recurring_discount_percent` — toda renovação aplica o desconto salvo **sem revalidar o cupom**. **Churn e retorno (definido)**: assinatura cancelada que retorna **não** recupera o desconto; precisa aplicar um cupom válido novamente (novo redemption só é possível se o usuário nunca tiver usado cupom — como já usou, retorno é a preço cheio, salvo exceção manual do admin).

### `commissions`
`id, redemption_id UNIQUE, affiliate_id, amount, status (pending → approved → paid | cancelled | reversed), eligible_at, approved_at, paid_at, paid_by, payment_reference, notes`

### `audit_logs`
`id, actor_user_id, action, entity, entity_id, payload jsonb, created_at`

---

## 5. Regras de Negócio

### 5.1 Fluxo sem cupom
1. Cadastro → trial de 7 dias.
2. Checkout ao fim do trial (ou antes, se quiser): cartão parcelado a preço cheio ou PIX à vista com −5%.

### 5.2 Fluxo com cupom (checkout imediato)
1. Usuário chega com `?cupom=CODIGO` (link do afiliado) ou digita o código no checkout — inclusive durante o trial.
2. Validações, nesta ordem:
   - cupom existe e `status = active`;
   - dentro de `starts_at`/`expires_at`;
   - `max_redemptions` não atingido;
   - usuário nunca usou cupom (unique vitalício por usuário);
   - usuário não é assinante ativo;
   - afiliado (e business, se houver) `active`;
   - anti-fraude: usuário ≠ afiliado dono do cupom.
3. Preço em tempo real: cartão `parcela × 0,80`; PIX à vista `total × 0,76`.
4. Pagamento confirmado → transação atômica: cria `subscription` com `recurring_discount_percent = 20`, cria `coupon_redemption`, incrementa contador, gera `commission` (`pending`, com `eligible_at = paid_at + 7 dias`).
5. Renovações: billing aplica o desconto salvo na assinatura; cupom expirado/pausado depois **não** afeta quem já assinou.

### 5.3 Reembolso e estorno de comissão
- Janela de reembolso: **7 dias** a contar do pagamento (direito de arrependimento, CDC art. 49). A política vive nos **Termos de Uso** — sem destaque no checkout ou na UI, apenas o link padrão para os Termos.
- Comissão nasce `pending` e só fica **elegível para aprovação após 7 dias** (`eligible_at`) — assim nunca se paga comissão de venda que ainda pode ser reembolsada.
- Reembolso dentro da janela: redemption `refunded`, comissão `cancelled`.
- Chargeback após pagamento da comissão: comissão `reversed` (saldo negativo a compensar em pagamentos futuros do afiliado).

### 5.4 Comissão (definido)
- **Gatilho: somente o primeiro pagamento** da assinatura com cupom. Renovações **não** geram comissão.
- Cálculo: `fixed` (R$) ou `percent` sobre o `net_amount` (valor efetivamente pago), conforme configuração do afiliado/cupom feita pelo admin. Sempre snapshot imutável.

### 5.5 Ciclo de vida do cupom
- `paused` / `expired`: bloqueiam novos usos; assinaturas existentes mantêm o desconto.
- `archived`: soft delete; nunca hard delete se houver redemptions.

---

## 6. Painel Admin

### 6.1 Visão Geral
- Cards: cupons ativos, assinaturas via cupom no período, receita via cupom (bruto × líquido), comissões pendentes/elegíveis (R$), comissões pagas no mês.
- Gráficos: usos/assinaturas no tempo; funil com cupom (checkout direto) vs sem cupom (trial 7d → pago).
- Ranking de afiliados e de businesses.

### 6.2 Planos e Preços
- CRUD de preços por plano/ciclo (Pro/Plus × anual/semestral) e edição dos percentuais (cupom, PIX). Alterações auditadas, com vigência apenas para novas assinaturas.

### 6.3 Cupons (CRUD global — todos os campos)
- Tabela com busca/filtros (código, afiliado, business, status). Criar/editar: código (unicidade em tempo real), afiliado, `%` de desconto, renovações, limite, validade, notas. Ações: pausar/reativar, arquivar, copiar link (`https://tiktally.com.br/?cupom=CODIGO`).

### 6.4 Businesses e Afiliados
- CRUD de businesses; vincular/desvincular afiliados. CRUD de afiliados (independentes ou de business) com regra de comissão; convite por e-mail com a role correta.

### 6.5 Histórico e Comissões
- Histórico global: data, cupom, afiliado, business, plano/ciclo, método (cartão/PIX), valor pago, status. Export CSV.
- Comissões: fila separando `pending` (em janela de 7 dias) e **elegíveis**; aprovação individual/lote; pagar com `payment_reference`; estornar com motivo. Relatório mensal por afiliado e por business.

---

## 7. Painel Business

- **Visão geral da carteira**: usos, assinaturas e receita gerada pelos cupons dos seus afiliados; comissões pendentes/pagas da carteira; ranking interno.
- **Afiliados**: criar/editar afiliados da carteira (dados, PIX, status).
- **Cupons**: CRUD limitado — edita `code`, limite de usos, validade, pausar/reativar e notas; **% de desconto travado em 20%** pelo admin.
- **Histórico**: usos e comissões da carteira (assinantes mascarados). Export CSV.
- Não aprova nem paga comissões.

---

## 8. Painel do Afiliado

- **Visão geral**: usos do meu cupom, assinaturas geradas, comissão pendente/recebida; gráfico no tempo; bloco de divulgação (código + link copiáveis).
- **Meu cupom**: parâmetros somente leitura; alterações via business/admin.
- **Histórico**: data, assinante mascarado, plano/ciclo, valor pago, status (`ativa`/`cancelada`/`reembolsada`), comissão gerada.
- **Minhas comissões**: extrato com status e referência de pagamento; edição da própria chave PIX.

---

## 9. API (contratos sugeridos)

Prefixo `/api/v1`; middleware de role por rota.

```
# Público / checkout
GET    /pricing?coupon=CODIGO&method=card|pix   # tabela calculada (fonte única)
POST   /checkout                                # { plan, cycle, coupon?, payment_method }
       422: { error_code: COUPON_NOT_FOUND | COUPON_EXPIRED |
              COUPON_LIMIT_REACHED | ALREADY_REDEEMED | NOT_ELIGIBLE }

# Admin
GET/POST     /admin/coupons                  GET/PATCH /admin/coupons/:id
GET/POST     /admin/businesses               GET/PATCH /admin/businesses/:id
GET/POST     /admin/affiliates               GET/PATCH /admin/affiliates/:id
GET/PATCH    /admin/prices
GET          /admin/redemptions              # filtros + export
GET          /admin/commissions?status=pending|eligible|approved|paid
POST         /admin/commissions/:id/approve | /pay | /reverse

# Business (escopo automático pela carteira)
GET          /business/overview
GET/POST     /business/affiliates            GET/PATCH /business/affiliates/:id
GET/POST     /business/coupons               GET/PATCH /business/coupons/:id   # campos limitados
GET          /business/redemptions
GET          /business/commissions

# Afiliado
GET          /affiliate/overview | /coupon | /redemptions | /commissions
PATCH        /affiliate/profile              # pix_key

# Billing (interno)
POST         /internal/billing/payment-confirmed   # ativa redemption + cria comissão (pending, eligible_at +7d)
POST         /internal/billing/refund              # marca refunded + cancela/estorna comissão
```

---

## 10. Decisões Definidas (histórico)

| # | Decisão | Definição |
|---|---|---|
| 1 | Empilhamento cupom + PIX | Multiplicativo: ×0,80 × 0,95 = ×0,76 (24% total) |
| 2 | PIX em parcelado | Não existe. PIX = à vista do ciclo; parcelas só no cartão |
| 3 | Comissão | Só no primeiro pagamento; tipo (fixa/%) configurado por afiliado/cupom pelo admin |
| 4 | Churn e retorno | Não recupera os 20%; volta a preço cheio |
| 5 | Campos do Business no cupom | Código, limite, validade, status, notas; % travado em 20% |
| 6 | Cupom durante o trial | Pode aplicar a qualquer momento no checkout |
| 7 | Janela de estorno | 7 dias (CDC art. 49); comunicada nos Termos de Uso, sem destaque na UI; comissão só fica elegível após a janela |
| 8 | Migração do modelo antigo | Não há dados a preservar; começar limpo |

---

## 11. Ordem de Implementação Sugerida

1. Migrations: `plans/prices/settings`, `businesses`, `affiliates`, `coupons`, `coupon_redemptions`, `commissions` + RLS por role.
2. Motor de preço (`GET /pricing`): 4 combinações (cheio, cupom, PIX, cupom+PIX) × 4 planos/ciclos.
3. Checkout com cupom → assinatura com desconto recorrente + comissão `pending` com `eligible_at = +7d`.
4. Renovação com desconto persistido + fluxo de refund/estorno (job que promove comissões a elegíveis após a janela).
5. Painel Admin (preços → cupons → businesses/afiliados → comissões).
6. Painel Business → Painel Afiliado.
7. Auditoria, exports CSV e métricas comparativas (funil com/sem cupom).
8. Testes-chave: matriz de preços completa; arredondamento (2 casas, definir regra de round half-up); unicidade vitalícia de uso; desconto persistente na renovação com cupom expirado; churn sem recuperação de desconto; comissão não elegível antes de 7 dias; escopo de dados por role; permissões de edição do business.
