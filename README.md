# TikTally Backoffice — Fiscal

Console **interno** da equipe TikTally para operar o sistema fiscal (NF-e via Spedy)
**dos sellers**. Não emite notas da TikTally — dá visibilidade e ações de operação
sobre as notas que os próprios sellers emitem pelo app principal.

> Repositório **separado** do app TikTally, mas conecta no **mesmo projeto Supabase**
> (`zgkxtyewmbkupuzeoyya`). Acesso restrito a `profiles.is_admin = true`.

## O que dá pra fazer

- **Dashboard**: total de notas, autorizadas/rejeitadas/processando, taxa de rejeição,
  valor autorizado, emissões dos últimos 30 dias, rejeições recentes, sellers em sandbox.
- **Notas (NF-e)**: lista cross-seller com filtro por status / busca (CNPJ, nº NF, pedido,
  comprador) e paginação.
- **Detalhe da nota**: dados completos + resposta bruta da Spedy + ações:
  - **Verificar status** na SEFAZ (`GET /product-invoices/{id}`)
  - **Reprocessar** rejeitada (`POST /product-invoices/{id}/issue`)
  - **Reenviar e-mail** (`POST /product-invoices/{id}/resend-email`)
  - **Baixar DANFE / XML** (`/pdf`, `/xml`)
- **Sellers**: empresas com config fiscal, regime, status Spedy, validade do certificado,
  volume de notas e rejeições.
- **Webhooks**: lista os webhooks da conta Spedy e permite reabilitar os que a Spedy
  desligou após falhas de entrega (`PUT /webhooks/{id}/enable|disable`).

## Cupons

Painel de gestão dos cupons que o **app principal já usa** (tabela `coupons`,
resgatados no checkout/paywall via `billing-validate-coupon` / `billing-redeem-trial`).
Não cria schema novo — opera a tabela existente. Um cupom criado aqui **vale no
TikTally imediatamente**.

Três tipos de cupom (`discount_kind`):

- **PERCENTAGE** — desconto em % sobre o plano.
- **FIXED** — desconto fixo em R$ (armazenado em centavos).
- **TRIAL_DAYS** — teste grátis: resgatado na tela de planos, cria um trial sem cobrança.

Telas:

- **Visão geral**: total/ativos, resgates no período (7/30/90d), trials concedidos,
  desconto total dado, série temporal e ranking dos mais resgatados.
- **Cupons**: CRUD com verificação de código em tempo real, tipo/valor de desconto,
  limite de resgates (ilimitado ou N), validade, planos/ciclos aplicáveis
  (`pro`/`erp`, `semiannually`/`yearly`), ativar/desativar e copiar código.
- **Resgates**: histórico com filtros (tipo/período), e-mail do usuário e exportação CSV.

> Backend: só o deploy da function `bo-coupons` (mesma segurança do `bo-fiscal`).
> **Nenhuma migration** — as tabelas `coupons`/`coupon_redemptions` já existem no
> app principal.
>
> Não há programa de afiliados/comissões: o TikTally não tem esse conceito hoje.

## Arquitetura

```
Browser (admin logado)
   │  supabase.functions.invoke('bo-fiscal', { action, ... })  [JWT do admin]
   ▼
Edge Function  bo-fiscal   (no mesmo projeto Supabase)
   ├─ valida profiles.is_admin (service-role)
   ├─ lê invoices / fiscal_configs / profiles cross-tenant (service-role)
   └─ chama a Spedy por seller (token da empresa + base prod/sandbox)
```

O front usa **apenas a chave anon** — toda operação privilegiada passa pelas edge
functions gateway (`bo-fiscal`, `bo-coupons`), o único lugar com service-role e que
validam o admin server-side. Ambos só **leem e operam** dados que já existem no
projeto — nenhuma migration nova.

## Setup

```bash
cp .env.example .env       # preencha VITE_SUPABASE_PUBLISHABLE_KEY (anon do projeto)
npm install
npm run dev                # http://localhost:8090
```

`.env`:

| Var | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://api.tiktally.com.br` (mesmo do app) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave **anon** do projeto `zgkxtyewmbkupuzeoyya` |
| `VITE_BO_FISCAL_FN` | `bo-fiscal` (default) |

## Teste local (sem deploy em produção)

Dá pra rodar **tudo local** apontando pro projeto Supabase real (auth + dados de
prod), sem subir nada. A function valida `is_admin` mesmo local, então é seguro.

```bash
# 1. Function local (lê o projeto real via service-role)
cp supabase/functions/.env.local.example supabase/functions/.env.local   # preencha
npx supabase functions serve bo-fiscal --no-verify-jwt \
  --env-file supabase/functions/.env.local
# → sobe em http://localhost:54321/functions/v1/bo-fiscal

# 2. Front apontando pra function local
#    no .env, descomente:
#    VITE_BO_FISCAL_URL="http://localhost:54321/functions/v1/bo-fiscal"
npm run dev    # http://localhost:8090 — login com sua conta admin do app
```

`--no-verify-jwt` só desliga a checagem da **plataforma**; a function continua
validando o JWT (`getUser`) e o `profiles.is_admin` internamente. Ações de
escrita (reprocessar/verificar status) batem na Spedy **real** do seller — para
testar sem efeito fiscal, use um seller com `spedy_use_sandbox = true`.

## Deploy da Edge Function `bo-fiscal` (quando for pra produção)

A function vai para o **mesmo** projeto Supabase do app. Ela reaproveita os secrets
que as outras functions Spedy já usam — não precisa configurar nada novo:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (injetados pelo Supabase)
- `SPEDY_API_KEY` (owner — usado pelos webhooks de conta)
- `SPEDY_API_BASE_URL` (default `https://api.spedy.com.br/v1/`)
- `SPEDY_SANDBOX_API_KEY`, `SPEDY_SANDBOX_API_URL` (para sellers em sandbox)

Deploy via CLI:

```bash
npx supabase functions deploy bo-fiscal \
  --project-ref zgkxtyewmbkupuzeoyya
```

Para o módulo de cupons, só o deploy da `bo-coupons` (reaproveita `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY`, sem secrets novos e sem migration):

```bash
npx supabase functions deploy bo-coupons --project-ref zgkxtyewmbkupuzeoyya
```

> `verify_jwt` deve ficar **ligado** (default). O JWT do admin é validado pela
> plataforma e o `is_admin` é checado dentro da function.

## Acesso

Só entra quem tem `profiles.is_admin = true` no projeto. Use o mesmo e-mail/senha
do app TikTally. Contas sem admin veem tela de "acesso restrito".

## Deploy do front

Build estático (`npm run build` → `dist/`). Suba em qualquer host estático
(Vercel/Netlify/Cloudflare Pages). Sugestão de subdomínio: `backoffice.tiktally.com.br`.
A meta `robots: noindex` já está no `index.html`.

## Roadmap (próximos módulos do backoffice)

- Cancelamento de NF-e com justificativa (≥15 chars) direto pelo console.
- Carta de correção (CC-e).
- Reenvio/auditoria de webhooks Spedy recebidos (`webhook_events`).
- Inutilização de numeração.
- Outros módulos do backoffice além do fiscal (billing/Asaas, suporte, etc.).
```
