# Teste ponta-a-ponta — programa de afiliados

Como exercitar o fluxo completo **sem cobrar ninguém por engano**.

> ⚠️ **A Asaas do projeto está em PRODUÇÃO** (`ASAAS_ENV=production` — confirmado
> nos últimos 72 eventos de `webhook_debug_log`). Qualquer checkout de verdade
> gera **cobrança real**. Nada aqui manda você fazer uma compra em produção.

## Camada 1 — automatizada, segura (roda hoje)

### Regras puras (sem banco, sem rede)

```bash
cd tiktok-shop-tally && npm run test:rules
```

16 testes: matriz de preços do MD, empilhamento cupom+PIX (×0,76), comissão =
pool − desconto **sobre o valor pago**, e os limites 10/15/20 com o teto de 10%
sem afiliado.

### Typecheck das edge functions

```bash
cd tiktok-shop-tally && npm run check:functions
```

Foi a ausência disso que deixou um símbolo indefinido chegar em produção e
quebrar a renovação no cartão. Baseline hoje: **zero erros**.

### Fluxo com dados reais (semeia, valida e limpa)

```bash
cd tiktally-backoffice
SUPABASE_URL="https://zgkxtyewmbkupuzeoyya.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service role>" \
node scripts/e2e-affiliate-flow.mjs
```

Cria business + afiliado + cupom marcados com `E2E_TESTE`, confere que o motor
de preço enxerga o cupom e calcula certo, simula a comissão pela regra do pool,
testa as travas de integridade do banco — e **apaga tudo no fim**.

`--keep` mantém os dados pra inspeção · `--cleanup` remove sobras.

**Não** cria cobrança, **não** chama a Asaas, **não** simula pagamento.

## Camada 2 — confirmação de pagamento (precisa de ambiente isolado)

O que a camada 1 **não** cobre, porque exige um pagamento confirmado de verdade:

- resgate gravado com o snapshot rico (afiliado, business, plano, ciclo, método,
  gross/net)
- comissão criada com `eligible_at = paid_at + 7 dias`
- desconto recorrente **não** aplicado na renovação (regra travada)
- reembolso → resgate `refunded` + comissão `cancelled`
- chargeback pós-pagamento → comissão `reversed`
- unicidade vitalícia disparando no 2º cupom de parceiro

### Opção A — branch do Supabase (recomendada)

Cópia isolada do banco; a Asaas fica apontada pro sandbox.

1. `create_branch` no projeto (via MCP ou dashboard) — atenção ao custo.
2. Deploy das functions na branch.
3. Secrets da branch: `ASAAS_ENV=sandbox` + `ASAAS_API_KEY_SANDBOX` +
   `ASAAS_WEBHOOK_TOKEN_SANDBOX`.
4. Rode o roteiro abaixo apontando pra branch.
5. Descarte a branch no fim.

### Opção B — stack local

`supabase start` no `tiktok-shop-tally` (exige Docker, hoje não instalado),
migrations aplicadas, functions servidas localmente, Asaas em sandbox.

### Roteiro (em qualquer uma das opções)

| # | Passo | O que verificar |
|---|---|---|
| 1 | Admin cria business e dá acesso | `businesses.owner_user_id` preenchido |
| 2 | Business cria afiliado e dá acesso | `affiliates.user_id` preenchido — **é o que liga o anti-fraude** |
| 3 | Afiliado loga no backoffice | cai em `/affiliate`, vê o próprio painel; não alcança nada de admin |
| 4 | Business cria cupom **sem** afiliado a 15% | recusado (teto de 10% na própria conta) |
| 5 | Business cria cupom **com** afiliado a 20% | aceito |
| 6 | Cliente abre o link do afiliado (`/plans?cupom=X`) | cupom pré-aplicado; card mostra o preço com desconto |
| 7 | Cliente paga (cartão sandbox) | `coupon_redemptions` com snapshot completo; `commissions` `pending` com `eligible_at = paid_at + 7d`; valor = `(30 − desconto)%` do **pago** |
| 8 | Mesmo cliente tenta 2º cupom de parceiro | recusado (`ALREADY_REDEEMED`) |
| 9 | Afiliado tenta usar o próprio cupom | recusado (`NOT_ELIGIBLE`) |
| 10 | Outro afiliado da **mesma carteira** tenta | recusado (auto-uso cruzado) |
| 11 | Admin tenta aprovar antes de 7 dias | recusado |
| 12 | Reembolso do pagamento | resgate `refunded`; comissão `cancelled` |
| 13 | Renovação chega | cobrada a **preço cheio** e **sem** nova comissão |
| 14 | Admin aprova → paga uma comissão elegível | `paid` com `payment_reference`; tudo em `audit_logs` |

### Como conferir cada passo

```sql
-- resgate com o snapshot
select affiliate_id, business_id, plan_key, cycle, payment_method,
       pix_discount_applied, gross_amount_cents, net_amount_cents, status
from coupon_redemptions order by redeemed_at desc limit 5;

-- comissão: valor e janela
select c.status, c.commission_value, c.amount_cents, c.eligible_at,
       b.paid_at, r.net_amount_cents,
       round(r.net_amount_cents * c.commission_value / 100.0) as esperado
from commissions c
join coupon_redemptions r on r.id = c.redemption_id
left join billings b on b.id = r.billing_id
order by c.created_at desc limit 5;

-- trilha de auditoria
select action, entity, created_at from audit_logs order by created_at desc limit 20;
```

## Estado atual de produção

Consultado em 2026-08-04: **0 afiliados, 0 cupons de parceiro, 0 resgates,
0 comissões**. A máquina de afiliado/comissão **nunca rodou com dado real** —
tudo que está validado veio de leitura de código, aritmética e testes de função
pura. A camada 2 é o que falta pra fechar isso.
