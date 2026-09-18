/**
 * bo-leads — Gateway do Backoffice de Leads da TikTally.
 *
 * Lê os leads que a landing captura no gate de preço (edge `capture-lead` do
 * app principal grava em `pricing_leads`) e dá ao comercial o que falta pra
 * trabalhar a lista: quem é, se esquentou, se já virou conta e em que pé está
 * o follow-up.
 *
 * NÃO cria schema novo. O status de triagem e a anotação moram em
 * `pricing_leads.metadata.followup`, que a tabela já tem. Uma coluna nova
 * exigiria migration no projeto do app, e o backoffice não faz isso.
 *
 * Segurança (idêntica ao bo-fiscal / bo-coupons):
 *  - Exige JWT de usuário (verify_jwt). Dentro, valida profiles.is_admin via
 *    service-role. Quem não é admin recebe 403.
 *  - Leitura cross-tenant com service-role (bypassa RLS), por isso o gate de
 *    admin é obrigatório.
 *
 * Sem secrets novos: usa só SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
const ok = (data: unknown) => json({ success: true, data });
const fail = (error: string, status = 400) => json({ success: false, error }, status);

const LEAD_COLS =
  "id, name, email, whatsapp, source, proceeded_at, proceeded_plan, plan_cycle, referrer, user_agent, metadata, created_at, updated_at";

/**
 * Estados da triagem. "new" é a ausência de decisão, e por isso é gravado como
 * NULL em vez da string "new": assim o filtro do banco é um `is.null` simples e
 * lead antigo (que nunca passou por aqui e não tem a chave no metadata) cai no
 * mesmo balde de quem foi devolvido pra "novo" à mão. Com a string, os dois
 * grupos ficariam separados e a tela mostraria duas categorias de novo.
 */
const FOLLOWUP_STATUSES = ["new", "contacted", "won", "lost"] as const;
type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

const STATUS_PATH = "metadata->followup->>status";

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

/**
 * Tira do termo de busca o que o PostgREST lê como sintaxe. Vírgula e
 * parêntese quebram o `or(...)`, e o `%` transformaria a busca do operador em
 * curinga sem ele saber.
 */
function sanitizeSearch(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/[,()*%\\]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function isoOrNull(raw: unknown): string | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ─────────────────────────────────────────────────────────────────────────
// Cruzamento com as contas do app
// ─────────────────────────────────────────────────────────────────────────

interface AuthUserLite {
  id: string;
  created_at: string | null;
}

interface AccountIndex {
  byEmail: Map<string, AuthUserLite>;
  /** false = a varredura bateu no teto, então "não achei" não prova ausência. */
  complete: boolean;
}

/**
 * Índice email -> conta, montado varrendo o Auth.
 *
 * A Admin API não filtra usuário por e-mail, então o jeito de responder "esse
 * lead virou conta?" é ter a lista inteira em mãos. Como a resposta é a mesma
 * pra todos os leads da página, guardamos o índice por um minuto: sem isso,
 * cada troca de filtro na tela varreria o Auth de novo.
 *
 * O `complete` existe pra tela não mentir. Se a varredura parar no teto, o
 * lead sem correspondência pode ter conta numa página que não foi lida, e aí
 * a coluna mostra "não verificado" em vez de "sem conta".
 */
let indexCache: { at: number; value: AccountIndex } | null = null;
const INDEX_TTL_MS = 60_000;

async function loadAccountIndex(db: SupabaseClient): Promise<AccountIndex> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.value;

  const PAGINA = 1000;
  const MAX_PAGINAS = 20;
  const byEmail = new Map<string, AuthUserLite>();
  let complete = true;

  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGINA });
    if (error) throw new Error(error.message);
    const lote = data?.users ?? [];
    for (const u of lote) {
      const email = String(u.email ?? "").trim().toLowerCase();
      if (!email) continue;
      // Primeiro cadastro vence. Duplicata de e-mail não existe no Auth, mas
      // se existir, a conta original é a resposta certa pro comercial.
      if (!byEmail.has(email)) byEmail.set(email, { id: u.id, created_at: u.created_at ?? null });
    }
    if (lote.length < PAGINA) break;
    if (page === MAX_PAGINAS) {
      complete = false;
      console.warn(
        `[bo-leads] varredura de contas parou no teto de ${MAX_PAGINAS} páginas (${byEmail.size} contas).`
      );
    }
  }

  const value = { byEmail, complete };
  indexCache = { at: Date.now(), value };
  return value;
}

interface LeadAccount {
  user_id: string;
  signed_up_at: string | null;
  shop_name: string | null;
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
}

/** Dados de assinatura das contas encontradas, em uma consulta só. */
async function accountsFor(
  db: SupabaseClient,
  index: AccountIndex,
  emails: string[]
): Promise<Map<string, LeadAccount>> {
  const achados = new Map<string, AuthUserLite>();
  for (const e of emails) {
    const hit = index.byEmail.get(e);
    if (hit) achados.set(e, hit);
  }
  if (achados.size === 0) return new Map();

  const userIds = [...new Set([...achados.values()].map((u) => u.id))];
  const [{ data: subs }, { data: profiles }] = await Promise.all([
    db.from("subscriptions").select("user_id, plan, status, current_period_end").in("user_id", userIds),
    db.from("profiles").select("id, shop_name").in("id", userIds),
  ]);

  const subDe = new Map((subs ?? []).map((s: any) => [String(s.user_id), s]));
  const profDe = new Map((profiles ?? []).map((p: any) => [String(p.id), p]));

  const out = new Map<string, LeadAccount>();
  for (const [email, user] of achados) {
    const sub = subDe.get(user.id) as any;
    out.set(email, {
      user_id: user.id,
      signed_up_at: user.created_at,
      shop_name: (profDe.get(user.id) as any)?.shop_name ?? null,
      plan: sub?.plan ?? null,
      status: sub?.status ?? null,
      current_period_end: sub?.current_period_end ?? null,
    });
  }
  return out;
}

/** Achata metadata.followup nos campos que a tela consome. */
function shapeLead(row: any, account: LeadAccount | null) {
  const followup = (row.metadata ?? {}).followup ?? {};
  const status = followup.status ?? null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    whatsapp: row.whatsapp,
    source: row.source,
    proceeded_at: row.proceeded_at,
    proceeded_plan: row.proceeded_plan,
    plan_cycle: row.plan_cycle,
    referrer: row.referrer,
    created_at: row.created_at,
    followup_status: (FOLLOWUP_STATUSES.includes(status) ? status : "new") as FollowupStatus,
    followup_note: typeof followup.note === "string" ? followup.note : null,
    followup_at: followup.updated_at ?? null,
    account,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────

interface BaseFilters {
  search: string;
  from: string | null;
  to: string | null;
  temperature: "cold" | "hot" | "";
}

function readFilters(p: Record<string, any>): BaseFilters {
  const temp = p.temperature === "cold" || p.temperature === "hot" ? p.temperature : "";
  return {
    search: sanitizeSearch(p.search),
    from: isoOrNull(p.from),
    to: isoOrNull(p.to),
    temperature: temp,
  };
}

/** Aplica os filtros comuns (busca, período, temperatura) a uma query. */
function applyBase(q: any, f: BaseFilters) {
  if (f.search) {
    q = q.or(`name.ilike.%${f.search}%,email.ilike.%${f.search}%,whatsapp.ilike.%${f.search}%`);
  }
  if (f.from) q = q.gte("created_at", f.from);
  if (f.to) q = q.lte("created_at", f.to);
  if (f.temperature === "cold") q = q.is("proceeded_at", null);
  if (f.temperature === "hot") q = q.not("proceeded_at", "is", null);
  return q;
}

/** "new" é NULL no banco, os outros são a própria string. */
function applyStatus(q: any, status: string) {
  if (status === "new") return q.is(STATUS_PATH, null);
  return q.eq(STATUS_PATH, status);
}

async function actionListLeads(db: SupabaseClient, p: Record<string, any>) {
  const f = readFilters(p);
  const status = FOLLOWUP_STATUSES.includes(p.status) ? String(p.status) : "";
  const page = Math.max(1, Number(p.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(p.page_size) || 50));
  const inicio = (page - 1) * pageSize;

  let q = applyBase(db.from("pricing_leads").select(LEAD_COLS, { count: "exact" }), f);
  if (status) q = applyStatus(q, status);

  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(inicio, inicio + pageSize - 1);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const emails = rows.map((r: any) => String(r.email ?? "").trim().toLowerCase());

  const index = await loadAccountIndex(db);
  const contas = await accountsFor(db, index, emails);

  // Contadores das abas de status. São os MESMOS filtros da lista menos o de
  // status, senão a aba mostraria um número que some ao ser clicada.
  const counts: Record<string, number> = { all: 0, new: 0, contacted: 0, won: 0, lost: 0 };
  const alvos = ["all", ...FOLLOWUP_STATUSES];
  const results = await Promise.all(
    alvos.map(async (s) => {
      let cq = applyBase(db.from("pricing_leads").select("id", { count: "exact", head: true }), f);
      if (s !== "all") cq = applyStatus(cq, s);
      const { count: c, error: e } = await cq;
      if (e) throw new Error(e.message);
      return [s, c ?? 0] as const;
    })
  );
  for (const [s, c] of results) counts[s] = c;

  return ok({
    items: rows.map((r: any) => shapeLead(r, contas.get(String(r.email ?? "").trim().toLowerCase()) ?? null)),
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
    counts,
    accountsComplete: index.complete,
  });
}

/**
 * Painel do topo. Os números vêm de contagem no banco (exatos), menos o de
 * "virou conta", que precisa do cruzamento e por isso lê os e-mails de todos os
 * leads. Se essa leitura truncar, o card volta nulo e a tela esconde o número
 * em vez de mostrar um valor menor do que a realidade.
 */
async function actionOverview(db: SupabaseClient, p: Record<string, any>) {
  const days = [7, 30, 90].includes(Number(p.period)) ? Number(p.period) : 30;
  const since = new Date(Date.now() - days * 864e5).toISOString();

  const contar = async (build: (q: any) => any) => {
    const { count, error } = await build(db.from("pricing_leads").select("id", { count: "exact", head: true }));
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const [total, noPeriodo, quentes, novos, contatados, ganhos, perdidos] = await Promise.all([
    contar((q) => q),
    contar((q) => q.gte("created_at", since)),
    contar((q) => q.not("proceeded_at", "is", null)),
    contar((q) => q.is(STATUS_PATH, null)),
    contar((q) => q.eq(STATUS_PATH, "contacted")),
    contar((q) => q.eq(STATUS_PATH, "won")),
    contar((q) => q.eq(STATUS_PATH, "lost")),
  ]);

  // Série diária do período, montada a partir dos leads do recorte.
  const { data: doPeriodo, error: erroPeriodo } = await db
    .from("pricing_leads")
    .select("created_at, proceeded_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (erroPeriodo) throw new Error(erroPeriodo.message);

  const porDia = new Map<string, { date: string; leads: number; hot: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    porDia.set(d, { date: d, leads: 0, hot: 0 });
  }
  for (const l of doPeriodo ?? []) {
    const d = String(l.created_at).slice(0, 10);
    const bucket = porDia.get(d);
    if (!bucket) continue;
    bucket.leads++;
    if (l.proceeded_at) bucket.hot++;
  }

  // Quantos já viraram conta. Lê só o e-mail, em lotes, com teto.
  let comConta: number | null = 0;
  const index = await loadAccountIndex(db);
  if (!index.complete) {
    comConta = null;
  } else {
    const LOTE = 1000;
    const TETO = 20;
    let lidos = 0;
    for (let i = 0; i < TETO; i++) {
      const { data, error } = await db
        .from("pricing_leads")
        .select("email")
        .order("created_at", { ascending: false })
        .range(i * LOTE, i * LOTE + LOTE - 1);
      if (error) throw new Error(error.message);
      const lote = data ?? [];
      for (const l of lote) {
        if (index.byEmail.has(String(l.email ?? "").trim().toLowerCase())) (comConta as number)++;
      }
      lidos += lote.length;
      if (lote.length < LOTE) break;
      if (i === TETO - 1 && lidos < total) comConta = null;
    }
  }

  return ok({
    period: days,
    total,
    inPeriod: noPeriodo,
    hot: quentes,
    cold: total - quentes,
    withAccount: comConta,
    byStatus: { new: novos, contacted: contatados, won: ganhos, lost: perdidos },
    daily: [...porDia.values()],
  });
}

/**
 * Grava a triagem no metadata, preservando o que já estava lá.
 *
 * Lê o registro antes de escrever porque `update` em jsonb substitui a coluna
 * inteira: mandar só `{ followup }` apagaria qualquer outra chave que o
 * capture-lead tenha gravado.
 */
async function actionUpdateLead(db: SupabaseClient, p: Record<string, any>, actorId: string) {
  const id = String(p.id ?? "").trim();
  if (!id) return fail("id é obrigatório");

  const status = p.status === undefined ? undefined : String(p.status);
  if (status !== undefined && !FOLLOWUP_STATUSES.includes(status as FollowupStatus)) {
    return fail("status inválido");
  }
  const note = p.note === undefined ? undefined : String(p.note ?? "").slice(0, 2000);

  const { data: atual, error: erroLeitura } = await db
    .from("pricing_leads")
    .select(LEAD_COLS)
    .eq("id", id)
    .maybeSingle();
  if (erroLeitura) throw new Error(erroLeitura.message);
  if (!atual) return fail("Lead não encontrado", 404);

  const metadata = { ...((atual as any).metadata ?? {}) };
  const followup = { ...(metadata.followup ?? {}) };

  if (status !== undefined) followup.status = status === "new" ? null : status;
  if (note !== undefined) followup.note = note || null;
  followup.updated_at = new Date().toISOString();
  followup.updated_by = actorId;
  metadata.followup = followup;

  const { data: salvo, error } = await db
    .from("pricing_leads")
    .update({ metadata })
    .eq("id", id)
    .select(LEAD_COLS)
    .single();
  if (error) throw new Error(error.message);

  const index = await loadAccountIndex(db);
  const email = String((salvo as any).email ?? "").trim().toLowerCase();
  const contas = await accountsFor(db, index, [email]);
  return ok(shapeLead(salvo, contas.get(email) ?? null));
}

async function actionDeleteLead(db: SupabaseClient, p: Record<string, any>) {
  const id = String(p.id ?? "").trim();
  if (!id) return fail("id é obrigatório");
  const { error } = await db.from("pricing_leads").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return ok({ id, deleted: true });
}

// ─────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Método não suportado", 405);

  try {
    const db = adminClient();

    // ── Admin gate ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token || token === authHeader) return fail("Não autenticado", 401);

    const { data: userData, error: userErr } = await db.auth.getUser(token);
    if (userErr || !userData?.user) return fail("Token inválido ou expirado", 401);

    const { data: profile } = await db
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.is_admin) return fail("Acesso restrito a administradores", 403);
    const actorId = userData.user.id;

    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const action = String(body.action ?? "");

    switch (action) {
      case "overview":
        return await actionOverview(db, body);
      case "list_leads":
        return await actionListLeads(db, body);
      case "update_lead":
        return await actionUpdateLead(db, body, actorId);
      case "delete_lead":
        return await actionDeleteLead(db, body);
      default:
        return fail(`Ação desconhecida: ${action || "(vazia)"}`, 400);
    }
  } catch (err) {
    console.error("[bo-leads] erro:", err);
    return fail((err as Error)?.message ?? "Erro interno", 500);
  }
});
