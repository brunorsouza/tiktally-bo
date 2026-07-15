# TikTally Observability — Plano de Implementação

> **Status:** planejamento aprovado, código ainda não escrito (2026-07-06).
> **Repo:** este (`tiktally-backoffice`). O TikTally principal só recebe
> instrumentação leve (SDK de log). Backoffice concentra visualização, análise e alertas.

---

## 1. Objetivo

Dar à equipe (hoje, o Gabriel sozinho) uma **ferramenta interna** que responda 3 perguntas
em <30 segundos, sem precisar SSH no Supabase, ler CloudWatch, ou esperar seller reclamar:

1. **O TikTally tá saudável agora?** — taxa de erro por edge function, uptime, latência.
2. **O que está quebrando?** — quais APIs falham, quais crashes acontecem no front, com que
   frequência, afetando quantos usuários, desde quando.
3. **Por que quebrou?** — stack trace, request payload, response da API terceira, contexto
   (user_id, url, versão do bundle, período).

Motivação direta: o bug do `VITE_TIKTOK_MARKETING_APP_ID` ficou latente ~2 meses (12/mai → hoje)
porque não havia sinal proativo — só descoberto quando o Gabriel foi testar. Isso não pode se
repetir com pagamento, sync, NF-e ou webhook.

---

## 2. Escopo

### Entra

- **APIs falhando** — toda edge function do TikTally (Shop API, Marketing API, Spedy, Asaas,
  ML). Contagem, latência p50/p95, taxa de erro por janela.
- **Crashes de frontend** — `window.onerror`, `unhandledrejection`, erros de React
  (via ErrorBoundary), erros de `supabase.functions.invoke()`.
- **Falhas de sync** — reaproveitar `sync_jobs.status='failed'` que já existe.
- **Webhooks travados** — reaproveitar `webhook_events` que já existe.
- **Health dos jobs cron** — billing-renew, expiração, etc.
- **Painel `/health` no backoffice** — KPIs, timeline, tabela de erros agrupados por
  fingerprint, drawer de detalhe.
- **Marcar erro como resolvido** — botão "resolved" que seta `fixed_at`, some da lista ativa.

### Fica de fora (Fase 1)

- Session replay (isso é Sentry-tier, complexo).
- Distributed tracing (não é o momento — 1 dev, poucas fns).
- APM de queries SQL (Supabase Advisors já cobre o essencial).
- Alertas por email/Slack — vai pra **Fase 2** (depois que o painel estiver de pé).
- Sourcemap upload — Fase 2 (por enquanto stacks minificados; nomes de função ainda ajudam).
- Métricas de negócio (GMV, conversão) — isso é outra dimensão, não é observabilidade.

### Não é

- **Não substitui** o `AdminPage` do TikTally principal (gestão de users).
- **Não é** dashboard cliente-facing. Nunca aparece pro seller.
- **Não é** log estruturado formal (não é OpenTelemetry). É um sistema
  pragmático, feito pra 1 pessoa operar.

---

## 3. Arquitetura

Segue o mesmo padrão do `bo-fiscal`:

```
┌─────────────────────────┐       ┌──────────────────────────┐
│  TikTally (app seller)  │       │  Backoffice (este repo)  │
│                         │       │                          │
│  - errorLogger.ts       │       │  /health   /errors       │
│  - React ErrorBoundary  │       │  /api-status  /jobs      │
│  - _shared/logEvent.ts  │       │                          │
│  (edge functions)       │       │  supabase.functions      │
│                         │       │    .invoke('bo-observ')  │
└────────────┬────────────┘       └────────────┬─────────────┘
             │ POST log-event                   │ JWT do admin
             │ (JWT do seller ou service-role)  │
             ▼                                  ▼
        ┌────────────────────────────────────────────┐
        │            Supabase (compartilhado)         │
        │                                             │
        │  Novas:                                     │
        │   • app_events (tabela)                     │
        │   • v_health_summary (view materializada?)  │
        │   • rpc_error_groups (RPC de agrupamento)   │
        │                                             │
        │  Existentes (leitura):                      │
        │   • sync_jobs, webhook_events               │
        │   • profiles (is_admin)                     │
        │                                             │
        │  Edge functions novas:                      │
        │   • log-event (no repo TikTally)            │
        │   • bo-observability (aqui, gateway)        │
        └────────────────────────────────────────────┘
```

**Princípio:** TikTally **emite**, Backoffice **consulta**. Nenhum front lê a tabela `app_events`
direto — sempre via edge, que valida `is_admin` server-side (mesma regra do `bo-fiscal`).

---

## 4. Fontes de dados

### 4.1 Nova: `app_events` (tabela)

```sql
create table public.app_events (
  id            uuid primary key default gen_random_uuid(),
  ts            timestamptz not null default now(),
  user_id       uuid null references auth.users(id) on delete set null,
  level         text not null check (level in ('error','warn','info')),
  source        text not null check (source in ('frontend','edge_function','job','webhook')),
  kind          text not null,       -- ex: 'js_error', 'edge_500', 'ads_connect_missing_env'
  message       text,
  fingerprint   text,                -- hash estável pra agrupar
  context       jsonb default '{}',  -- url, ua, stack, request_id, status, latency_ms, ...
  release       text null,           -- versão do bundle (VITE_APP_VERSION)
  fixed_at      timestamptz null,    -- quando marcado como resolvido no backoffice
  fixed_by      uuid null references auth.users(id)
);

create index app_events_ts_desc          on app_events (ts desc);
create index app_events_level_source_ts  on app_events (level, source, ts desc);
create index app_events_fingerprint_ts   on app_events (fingerprint, ts desc)
  where fixed_at is null;
create index app_events_user_ts          on app_events (user_id, ts desc);
```

**RLS:**
- INSERT permitido pra `authenticated` (só o próprio `user_id` — pra frontend logar em nome dele).
- INSERT permitido pra `service_role` (edge functions).
- SELECT/UPDATE **negados** pra `authenticated` — leitura só via edge `bo-observability` com
  service-role, gated por `is_admin`. Isso evita que um seller olhe erro de outro.

**Retenção:** cron diário deleta `ts < now() - interval '30 days'`. Se ficar grande demais,
particiona por mês depois.

### 4.2 Fingerprinting

Chave de agrupamento (hash SHA-1 dos 3 primeiros elementos, truncado 12 chars):

- **frontend `js_error`**: `error.name + primeira linha de stack (função + arquivo)`.
- **edge_function**: `function_name + kind + primeiro trecho da message sem números`.
- **job**: `job_name + kind`.
- **webhook**: `provider + event_type + kind`.

Objetivo: mesmo bug reportado 500 vezes = 1 grupo com contador 500.

### 4.3 Fontes existentes (só leitura)

- `sync_jobs` — `status='failed'`, `error_message`. Latência = `completed_at - started_at`.
- `webhook_events` — `processed_at is null and ts < now() - 5min` = travado.
- Supabase logs — via MCP `get_logs` **não é acessível por app runtime**. Alternativa:
  o helper `logEvent` no `_shared` do TikTally já grava toda falha de edge em `app_events`,
  o que dá cobertura equivalente sem depender do MCP.

---

## 5. Instrumentação no TikTally (repo principal)

Isso é a **única mudança** que sai deste repo. Precisa ser leve e não invasiva.

### 5.1 Frontend — `src/lib/errorLogger.ts`

```ts
// engancha uma vez em main.tsx
export function initErrorLogger() {
  window.addEventListener('error',  (e) => log({ kind: 'js_error', ... }));
  window.addEventListener('unhandledrejection', (e) => log({ kind: 'unhandled_rejection', ... }));

  // wrapper em fetch pra capturar 4xx/5xx
  const origFetch = window.fetch;
  window.fetch = async (input, init) => {
    const t0 = performance.now();
    try {
      const r = await origFetch(input, init);
      if (!r.ok) log({ kind: 'fetch_failed', level: 'warn',
        context: { url, status: r.status, latency_ms: performance.now()-t0 }});
      return r;
    } catch (e) { log({ kind: 'fetch_error', ... }); throw e; }
  };
}

async function log(event) {
  // dispara sem bloquear; erro no log NÃO propaga
  supabase.functions.invoke('log-event', { body: event }).catch(() => {});
}
```

- Buffer local (1s / 20 eventos) pra evitar chuva de requests.
- Sampling: 100% de `error`, 100% de `warn`, `info` desligado por padrão.
- Ignorar erros conhecidos de terceiro (ex: extensões de browser via regex).

### 5.2 React — reaproveitar `ErrorBoundary` que já existe

Adicionar chamada de `logEvent` no `componentDidCatch`.

### 5.3 Edge functions — `_shared/logEvent.ts`

```ts
export async function logEvent(supabase, ev: {
  user_id?: string;
  level: 'error'|'warn'|'info';
  source: 'edge_function';
  kind: string;                    // ex: nome da fn + tipo de falha
  message?: string;
  context?: object;
}) {
  await supabase.from('app_events').insert({ ...ev, fingerprint: fp(ev) });
}
```

- Meto no `catch` de todas edges críticas: `ads-*`, `billing-*`, `tiktok-fetch-*`,
  `spedy-*`, `asaas-webhook-receiver`, `auto-emit-nfe`, `ledger-*`.
- Wrap opcional `withLogging(handler)` pra medir latência de TODAS as invocações, não
  só as que falharam (útil pra p95).

### 5.4 Nova edge no TikTally — `log-event`

- Recebe JWT do usuário (opcional se anônimo do landing).
- Valida payload (Zod).
- Insere em `app_events` (via service-role — user_id vem do JWT, não do body).
- Rate limit por user (max 100 eventos/min).

**Não vive neste repo** — mora no TikTally, em `supabase/functions/log-event/`.

### 5.5 Release tracking

- `vite.config.ts` injeta `VITE_APP_VERSION = git rev-parse --short HEAD` no build.
- Frontend manda esse valor em `release`. Assim se um bug começa depois de um deploy,
  a coluna `release` mostra em que build ele surgiu.

---

## 6. Edge function `bo-observability` (neste repo)

Mesmo padrão do `bo-fiscal`: gateway com `action`, valida `is_admin`, retorna JSON.

### Actions

| action | descrição | retorno |
|---|---|---|
| `health.summary` | KPIs 24h: total erros, taxa por source, top 3 kinds | `{ frontend: {..}, edges: {..}, jobs: {..} }` |
| `health.timeline` | eventos por hora nas últimas 24h/7d | `[ { ts, count, source, level } ]` |
| `errors.list` | grupos ativos (fingerprint) paginados | `[ { fingerprint, kind, count, users_affected, first_seen, last_seen, sample } ]` |
| `errors.detail` | eventos crus de um fingerprint | `[ { ts, user_id, context, message } ]` |
| `errors.resolve` | seta `fixed_at` no fingerprint | `{ ok: true }` |
| `api.status` | latência p50/p95 + taxa erro por edge function nas últimas 24h | `[ { fn, calls, err_rate, p50, p95 } ]` |
| `jobs.recent` | últimos syncs / renewals / auto-emit com status | `[ { job, status, ts, duration_ms, err } ]` |
| `webhooks.stuck` | webhooks não processados > 5min | `[ { id, provider, event, age_min } ]` |

Chamado do front via `supabase.functions.invoke('bo-observability', { body: { action, ... }})`.

---

## 7. Frontend (páginas novas neste repo)

### 7.1 `/health` — a tela que abre primeiro

- 4 KPI cards no topo (24h):
  - **Erros no frontend** (contagem, delta vs 24h anterior, sparkline)
  - **Edges falhando** (contagem + top 3 funções)
  - **Syncs falhos** (count, botão "ver todos")
  - **Webhooks travados** (count por provider)
- Timeline empilhada por hora (source × contagem). Recharts.
- Lista de "erros novos hoje" (fingerprints com `first_seen > now() - 24h`).
- Link "Ver todos os erros" → `/errors`.

### 7.2 `/errors` — hunt list

- Tabela agrupada por fingerprint. Colunas: kind, sample message, count, users
  afetados, primeira vez, última vez, source, level, release.
- Filtros: source, level, período (24h/7d/30d), "só não resolvidos", search em message.
- Ordenação default: `count desc` (o que mais dói primeiro).
- Row → drawer com histórico do fingerprint + botão "Marcar resolvido".

### 7.3 `/errors/:fingerprint` — drawer/página

- Metadados do grupo.
- Últimos 100 eventos crus (context, stack, url, user_id, release).
- Botão "Marcar resolvido" (chama `errors.resolve`, seta `fixed_at`).
- Gráfico "ocorrências por hora" pra saber se está piorando.

### 7.4 `/api-status`

- Tabela: função, chamadas 24h, taxa de erro, p50, p95.
- Highlight vermelho se `err_rate > 5%` OU `p95 > 5s`.
- Sparkline por linha.

### 7.5 `/jobs`

- Aba syncs / renewals / NF-e auto / crons.
- Últimas 50 execuções por tipo.
- Filtro por seller (útil pra debug de conta específica).

### 7.6 Sidebar

Adicionar seção "Observability" com os 4 links acima. `bo-fiscal` continua intocado.

---

## 8. Alertas (Fase 2)

Não entra na Fase 1. Estrutura pronta pra plugar depois:

- Cron a cada 5 min (`pg_cron` ou edge com schedule).
- Regras simples em SQL: `if err_rate_last_15min > 10% then send`.
- Destino: webhook Discord (o mais barato, o Gabriel já usa) ou email via Resend.
- Deduplicação por fingerprint (não repete o mesmo alerta em <1h).

---

## 9. Retenção e custos

- **Volume estimado (chute conservador):** ~10k eventos/dia (front + edges).
- **30 dias** de retenção = ~300k linhas. Bem dentro do plano Pro do Supabase.
- Cron diário de purge: `delete from app_events where ts < now() - interval '30 days'`.
- Se explodir: particionamento mensal + downsampling (guarda agregado por hora após 7d).

---

## 10. Fases de implementação

### Fase 0 — Migration + edge no TikTally (0.5 dia)
- [ ] Migration `app_events` + RLS + índices (via MCP Supabase)
- [ ] Edge fn `log-event` no repo TikTally
- [ ] Testar insert manual via curl

### Fase 1 — Instrumentação (1 dia)
- [ ] `errorLogger.ts` no TikTally + wire no `main.tsx`
- [ ] `ErrorBoundary` grava no `app_events`
- [ ] Helper `_shared/logEvent.ts` + meter em ~10 edges críticas
- [ ] Release tag no bundle
- [ ] Verificar eventos aparecendo no DB

### Fase 2 — Backoffice: painel (1.5 dia)
- [ ] Edge `bo-observability` neste repo (5 actions da Fase 1)
- [ ] Página `/health` (KPIs + timeline)
- [ ] Página `/errors` (tabela + filtros + drawer)
- [ ] Ação "marcar resolvido"

### Fase 3 — Backoffice: profundidade (1 dia)
- [ ] `/api-status`
- [ ] `/jobs`
- [ ] `/webhooks/stuck` (extensão do que já existe)

### Fase 4 — Alertas (0.5 dia, opcional/depois)
- [ ] Cron de checagem
- [ ] Integração Discord webhook

**Total Fase 0+1+2+3:** ~4 dias de foco. Fase 4 quando doer.

---

## 11. Riscos e trade-offs

| Risco | Mitigação |
|---|---|
| **Chuva de eventos infla o DB** | Rate limit por user, sampling, retenção 30d, batching no cliente. |
| **Erro no logger causa erro no logger (loop)** | `logEvent` NUNCA propaga exception; try/catch silencioso; nunca chama logEvent dentro do próprio `log-event`. |
| **PII no `context`** | Sanitizar cookies, Authorization headers, campos que começam com `card_`, `cpf`, `email` antes de enviar. |
| **Stack traces minificados** | Fase 2: upload de sourcemaps pro Supabase Storage + resolução server-side. Aceitável na Fase 1. |
| **Backoffice virar single point** | Se o painel cair, TikTally continua ok — só perde visibilidade. Não é caminho crítico. |
| **Alertas viram spam** | Dedupe por fingerprint + cooldown 1h + só `err_rate` acima de threshold, não evento único. |

---

## 12. Decisões abertas (precisam de resposta antes de codar)

1. **Retenção de 30d serve?** Ou 14d/60d? (Impacta storage.)
2. **Rate limit de 100 evt/min por user** é generoso ou apertado?
3. **`bo-observability` fica no mesmo padrão de action-gateway do `bo-fiscal`,
   ou split em `bo-health` / `bo-errors` / `bo-api`?** Recomendo gateway único, mais simples.
4. **Onde deploy do `log-event`?** No mesmo projeto Supabase (fácil). Confirmar.
5. **Manter o esconderijo do Marketing/Ads igual TikTally?** Ou o backoffice pode ver
   tudo cru (`ads-connect`, `spedy-*`)? Recomendo cru — é interno.
6. **Session storage do bundle version:** commit hash ou tag semver? Recomendo commit hash
   curto (7 chars) — mais direto pra debugar.

---

## 13. Fora de escopo (referência)

Estas dores existem mas não são cobertas por este plano:

- **Cost tracking** (quanto cada seller custa em edge invocations) — outro projeto.
- **Feature analytics** (quantos usam `/marketing`, `/campaigns`) — Posthog/Mixpanel.
- **Uptime externo** (site fora do ar) — UptimeRobot é 30s de setup, não vale reinventar.
- **Security auditing** (tentativas de login, RLS violations) — pode virar Fase 5.

---

## Próximo passo concreto

Ler este plano, responder as **6 perguntas da seção 12**, e daí começar pela **Fase 0**
(migration + `log-event`). A migration é o menor movimento reversível: sem ela, nada mais
funciona; com ela pronta e testada, a Fase 1 pode andar em paralelo com o desenho fino
do painel.
