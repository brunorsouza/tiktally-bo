/**
 * bo-fiscal — Gateway do Backoffice Fiscal da TikTally.
 *
 * Console admin SOBRE o sistema fiscal dos sellers (NF-e via Spedy). NÃO emite
 * notas da TikTally — opera as notas que os sellers já emitem.
 *
 * Segurança:
 *  - Exige JWT de usuário (verify_jwt). Dentro, valida profiles.is_admin via
 *    service-role. Quem não é admin recebe 403.
 *  - Toda leitura é cross-tenant via service-role (bypassa RLS) — por isso o
 *    gate de admin é obrigatório.
 *
 * Spedy: auth é POR EMPRESA. Para operar a nota de um seller, usamos o token da
 * empresa dele (fiscal_configs.spedy_api_token) + base de prod/sandbox conforme
 * fiscal_configs.spedy_use_sandbox. Webhooks são de CONTA → usam a chave OWNER
 * do env (SPEDY_API_KEY). Espelha os secrets já usados pelas outras functions:
 *   SPEDY_API_KEY, SPEDY_API_BASE_URL, SPEDY_SANDBOX_API_KEY, SPEDY_SANDBOX_API_URL
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-spedy-sandbox",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STATUSES = ["pending", "processing", "authorized", "rejected", "cancelled"] as const;
type Status = (typeof STATUSES)[number];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
const ok = (data: unknown) => json({ success: true, data });
const fail = (error: string, status = 400) => json({ success: false, error }, status);

// ─────────────────────────────────────────────────────────────────────────
// Spedy helpers
// ─────────────────────────────────────────────────────────────────────────

function normalizeBaseUrl(raw: string): string {
  const t = raw.trim();
  return t.endsWith("/") ? t : `${t}/`;
}

function prodBaseUrl(): string {
  const raw = Deno.env.get("SPEDY_API_BASE_URL")?.trim();
  return raw ? normalizeBaseUrl(raw) : "https://api.spedy.com.br/v1/";
}

function sandboxBaseUrl(): string {
  const raw =
    Deno.env.get("SPEDY_SANDBOX_API_URL")?.trim() ||
    Deno.env.get("SPEDY_SANDBOX_BASE_URL")?.trim();
  return raw ? normalizeBaseUrl(raw) : "https://sandbox-api.spedy.com.br/v1/";
}

function normalizeToken(raw: string): string {
  let t = raw.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  if (t.toLowerCase().startsWith("bearer ")) t = t.slice(7).trim();
  return t;
}

interface SpedyCreds {
  baseUrl: string;
  apiKey: string;
  sandbox: boolean;
}

/** Resolve credenciais Spedy para um seller (token da empresa + base prod/sandbox). */
function resolveSellerSpedy(
  spedyToken: string | null,
  useSandbox: boolean | null
): SpedyCreds {
  const sandbox = !!useSandbox;
  const baseUrl = sandbox ? sandboxBaseUrl() : prodBaseUrl();
  const envKey = sandbox
    ? Deno.env.get("SPEDY_SANDBOX_API_KEY")
    : Deno.env.get("SPEDY_API_KEY");
  const token = spedyToken ? normalizeToken(spedyToken) : "";
  const apiKey = token || normalizeToken(envKey ?? "");
  if (!apiKey) {
    throw new Error(
      sandbox
        ? "Spedy sandbox: sem token do seller e SPEDY_SANDBOX_API_KEY ausente."
        : "Spedy: sem token do seller e SPEDY_API_KEY ausente."
    );
  }
  return { baseUrl, apiKey, sandbox };
}

/** Credenciais OWNER da conta (para webhooks, escopo de conta). */
function resolveOwnerSpedy(): SpedyCreds {
  const apiKey = normalizeToken(Deno.env.get("SPEDY_API_KEY") ?? "");
  if (!apiKey) throw new Error("Spedy: SPEDY_API_KEY (owner) ausente nas Edge Functions.");
  return { baseUrl: prodBaseUrl(), apiKey, sandbox: false };
}

async function spedyFetch(
  creds: SpedyCreds,
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const res = await fetch(`${creds.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": creds.apiKey,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* não-JSON (ex: erro em html) */
  }
  return { ok: res.ok, status: res.status, json: parsed, text };
}

function mapSpedyStatus(raw: string): Status {
  const s = (raw || "").toLowerCase().trim();
  if (s === "authorized" || s === "authorizedwithnotes" || s === "autorizada") return "authorized";
  if (
    ["rejected", "rejectedwithreason", "rejeitada", "error", "erro", "denied", "negada"].includes(s)
  )
    return "rejected";
  if (s === "cancelled" || s === "canceled" || s === "cancelada") return "cancelled";
  return "processing";
}

function extractInvoiceUpdates(source: any, normalized: Status): Record<string, unknown> {
  const inv0 = Array.isArray(source?.invoices) && source.invoices[0] ? source.invoices[0] : null;
  const updates: Record<string, unknown> = { status: normalized, spedy_response: source };
  if (normalized === "authorized") {
    updates.nfe_key = source?.accessKey || inv0?.accessKey || source?.chave || null;
    const numRaw = source?.number ?? inv0?.number ?? source?.numero ?? null;
    updates.nfe_number = numRaw != null && numRaw !== "" ? String(numRaw) : null;
    updates.danfe_url = source?.danfe_url || source?.pdf_url || null;
    updates.xml_url = source?.xml_url || null;
    updates.issued_at = new Date().toISOString();
    updates.error_message = null;
  } else if (normalized === "rejected") {
    const pd = source?.processingDetail ?? inv0?.processingDetail;
    updates.error_message = pd?.message || source?.mensagem || source?.error || "Rejeitada pela SEFAZ";
  }
  return updates;
}

// ─────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

/**
 * Trilha de auditoria. Nunca derruba a ação: um log que falha não pode
 * desfazer um cadastro que já aconteceu — o erro vai pro console e segue.
 */
async function audit(
  db: SupabaseClient,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  payload: Record<string, unknown> = {}
) {
  try {
    await db
      .from("audit_logs")
      .insert({ actor_user_id: actorId, action, entity, entity_id: String(entityId), payload });
  } catch (e) {
    console.error("[bo-fiscal] audit falhou:", e);
  }
}

async function countByStatus(db: SupabaseClient, status: Status, userId?: string): Promise<number> {
  let q = db.from("invoices").select("*", { count: "exact", head: true }).eq("status", status);
  if (userId) q = q.eq("user_id", userId);
  const { count } = await q;
  return count ?? 0;
}

async function fiscalConfigFor(db: SupabaseClient, userId: string) {
  const { data } = await db
    .from("fiscal_configs")
    .select(
      "user_id, cnpj, razao_social, nome_fantasia, regime_tributario, spedy_active, spedy_company_id, spedy_use_sandbox, spedy_api_token, emission_mode, certificate_expires_at, created_at"
    )
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function emailFor(db: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

async function getInvoiceRow(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nota não encontrada");
  return data as Record<string, any>;
}

/** Busca a NF-e na Spedy (tenta product-invoices, fallback orders). */
async function fetchSpedyInvoice(creds: SpedyCreds, inv: Record<string, any>) {
  const candidate = inv.spedy_invoice_id || inv.spedy_order_id;
  if (!candidate) throw new Error("Nota sem spedy_invoice_id/spedy_order_id — não dá pra consultar.");

  const pi = await spedyFetch(creds, `product-invoices/${encodeURIComponent(candidate)}`);
  if (pi.ok && pi.json) return pi.json;

  // fallback legado: /orders/{id} → invoices[0]
  const ord = await spedyFetch(creds, `orders/${encodeURIComponent(candidate)}`);
  if (ord.ok && ord.json) {
    const invId = Array.isArray(ord.json.invoices) ? ord.json.invoices[0]?.id : null;
    if (invId) {
      const pi2 = await spedyFetch(creds, `product-invoices/${encodeURIComponent(invId)}`);
      if (pi2.ok && pi2.json) return pi2.json;
    }
    return ord.json;
  }
  throw new Error(`Spedy não encontrou a nota (${pi.status}).`);
}

// ─────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────

async function actionMetrics(db: SupabaseClient) {
  const by_status = {} as Record<Status, number>;
  for (const s of STATUSES) by_status[s] = await countByStatus(db, s);
  const total = STATUSES.reduce((a, s) => a + by_status[s], 0);

  const [cfgTotal, cfgActive, cfgSandbox] = await Promise.all([
    db.from("fiscal_configs").select("*", { count: "exact", head: true }),
    db.from("fiscal_configs").select("*", { count: "exact", head: true }).eq("spedy_active", true),
    db.from("fiscal_configs").select("*", { count: "exact", head: true }).eq("spedy_use_sandbox", true),
  ]);

  // valor autorizado (scan paginado, cap 20k)
  let authorized_amount = 0;
  for (let page = 0; page < 20; page++) {
    const { data } = await db
      .from("invoices")
      .select("total_amount")
      .eq("status", "authorized")
      .range(page * 1000, page * 1000 + 999);
    if (!data || data.length === 0) break;
    for (const r of data) authorized_amount += Number(r.total_amount ?? 0);
    if (data.length < 1000) break;
  }

  // by_day (30d)
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: recent } = await db
    .from("invoices")
    .select("created_at, status")
    .gte("created_at", since)
    .limit(5000);
  const buckets = new Map<string, { authorized: number; rejected: number; total: number }>();
  for (const r of recent ?? []) {
    const day = String(r.created_at ?? "").slice(0, 10);
    if (!day) continue;
    const b = buckets.get(day) ?? { authorized: 0, rejected: 0, total: 0 };
    b.total++;
    if (r.status === "authorized") b.authorized++;
    if (r.status === "rejected") b.rejected++;
    buckets.set(day, b);
  }
  const by_day = [...buckets.entries()]
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // rejeições recentes (+ shop_name)
  const { data: rej } = await db
    .from("invoices")
    .select("id, user_id, emitter_name, error_message, created_at")
    .eq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(8);
  const rejUserIds = [...new Set((rej ?? []).map((r) => r.user_id))];
  const { data: profs } = rejUserIds.length
    ? await db.from("profiles").select("id, shop_name").in("id", rejUserIds)
    : { data: [] as any[] };
  const shopById = new Map((profs ?? []).map((p: any) => [p.id, p.shop_name]));
  const recent_rejections = (rej ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    shop_name: shopById.get(r.user_id) ?? null,
    emitter_name: r.emitter_name,
    error_message: r.error_message,
    created_at: r.created_at,
  }));

  const denom = by_status.authorized + by_status.rejected;
  return ok({
    total,
    by_status,
    rejection_rate: denom > 0 ? by_status.rejected / denom : 0,
    authorized_amount,
    sellers_with_config: cfgTotal.count ?? 0,
    sellers_active: cfgActive.count ?? 0,
    sellers_sandbox: cfgSandbox.count ?? 0,
    recent_rejections,
    by_day,
  });
}

async function actionListInvoices(db: SupabaseClient, p: Record<string, any>) {
  const page = Math.max(1, Number(p.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(p.page_size ?? 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const build = (q: any) => {
    if (p.status) q = q.eq("status", p.status);
    if (p.user_id) q = q.eq("user_id", p.user_id);
    if (p.search) {
      const term = String(p.search).replace(/[,()%]/g, "").trim();
      if (term) {
        const digits = term.replace(/\D/g, "");
        const ors = [
          `nfe_number.ilike.%${term}%`,
          `order_id.ilike.%${term}%`,
          `tiktok_order_id.ilike.%${term}%`,
          `buyer_name.ilike.%${term}%`,
          `emitter_name.ilike.%${term}%`,
        ];
        if (digits.length >= 3) {
          ors.push(`emitter_cnpj.ilike.%${digits}%`, `buyer_cpf_cnpj.ilike.%${digits}%`);
        }
        q = q.or(ors.join(","));
      }
    }
    return q;
  };

  const { count } = await build(
    db.from("invoices").select("*", { count: "exact", head: true })
  );
  const { data, error } = await build(
    db.from("invoices").select("*").order("created_at", { ascending: false }).range(from, to)
  );
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((r: any) => r.user_id))];
  const [{ data: profs }, { data: cfgs }] = await Promise.all([
    userIds.length
      ? db.from("profiles").select("id, shop_name").in("id", userIds)
      : Promise.resolve({ data: [] as any[] }),
    userIds.length
      ? db.from("fiscal_configs").select("user_id, spedy_use_sandbox").in("user_id", userIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const shopById = new Map((profs ?? []).map((x: any) => [x.id, x.shop_name]));
  const sandboxById = new Map((cfgs ?? []).map((x: any) => [x.user_id, x.spedy_use_sandbox]));

  const items = rows.map((r: any) => ({
    ...r,
    sandbox: !!sandboxById.get(r.user_id),
    seller: { user_id: r.user_id, shop_name: shopById.get(r.user_id) ?? null, email: null },
  }));

  const total = count ?? 0;
  return ok({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

async function buildSeller(db: SupabaseClient, userId: string) {
  const [cfg, email, { data: prof }] = await Promise.all([
    fiscalConfigFor(db, userId),
    emailFor(db, userId),
    db.from("profiles").select("shop_name").eq("id", userId).maybeSingle(),
  ]);
  const counts = {} as Record<Status, number> & { total: number };
  let total = 0;
  for (const s of STATUSES) {
    counts[s] = await countByStatus(db, s, userId);
    total += counts[s];
  }
  counts.total = total;
  return {
    user_id: userId,
    email,
    shop_name: prof?.shop_name ?? null,
    cnpj: cfg?.cnpj ?? "",
    razao_social: cfg?.razao_social ?? null,
    nome_fantasia: cfg?.nome_fantasia ?? null,
    regime_tributario: cfg?.regime_tributario ?? null,
    spedy_active: cfg?.spedy_active ?? null,
    spedy_company_id: cfg?.spedy_company_id ?? null,
    spedy_use_sandbox: !!cfg?.spedy_use_sandbox,
    emission_mode: cfg?.emission_mode ?? null,
    certificate_expires_at: cfg?.certificate_expires_at ?? null,
    created_at: cfg?.created_at ?? null,
    counts,
  };
}

async function actionGetInvoice(db: SupabaseClient, p: Record<string, any>) {
  if (!p.id) return fail("id obrigatório");
  const inv = await getInvoiceRow(db, p.id);
  const seller = await buildSeller(db, inv.user_id);
  return ok({ invoice: { ...inv, sandbox: seller.spedy_use_sandbox }, seller });
}

async function actionListSellers(db: SupabaseClient) {
  const { data: cfgs } = await db
    .from("fiscal_configs")
    .select("user_id")
    .order("created_at", { ascending: false })
    .limit(300);
  const userIds = (cfgs ?? []).map((c: any) => c.user_id);
  const sellers = [];
  for (const uid of userIds) sellers.push(await buildSeller(db, uid));
  return ok(sellers);
}

async function actionCheckStatus(db: SupabaseClient, p: Record<string, any>) {
  if (!p.id) return fail("id obrigatório");
  const inv = await getInvoiceRow(db, p.id);
  const cfg = await fiscalConfigFor(db, inv.user_id);
  const creds = resolveSellerSpedy(cfg?.spedy_api_token ?? null, cfg?.spedy_use_sandbox ?? null);

  const source = await fetchSpedyInvoice(creds, inv);
  const raw = source?.status ?? (Array.isArray(source?.invoices) ? source.invoices[0]?.status : "");
  const normalized = mapSpedyStatus(String(raw ?? ""));
  const updates = extractInvoiceUpdates(source, normalized);

  const { data: updated, error } = await db
    .from("invoices")
    .update(updates)
    .eq("id", inv.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return ok({ ...updated, sandbox: creds.sandbox });
}

async function actionReprocess(db: SupabaseClient, p: Record<string, any>) {
  if (!p.id) return fail("id obrigatório");
  const inv = await getInvoiceRow(db, p.id);
  const cfg = await fiscalConfigFor(db, inv.user_id);
  const creds = resolveSellerSpedy(cfg?.spedy_api_token ?? null, cfg?.spedy_use_sandbox ?? null);

  const spedyId = inv.spedy_invoice_id || inv.spedy_order_id;
  if (!spedyId) return fail("Nota sem spedy_invoice_id — não dá pra reprocessar.");

  const res = await spedyFetch(creds, `product-invoices/${encodeURIComponent(spedyId)}/issue`, {
    method: "POST",
  });
  if (!res.ok) {
    const msg = res.json?.errors?.[0]?.message || res.json?.message || res.text || `HTTP ${res.status}`;
    return fail(`Spedy recusou o reprocessamento: ${msg}`);
  }

  const { data: updated, error } = await db
    .from("invoices")
    .update({ status: "processing", error_message: null })
    .eq("id", inv.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return ok({ ...updated, sandbox: creds.sandbox });
}

async function actionResendEmail(db: SupabaseClient, p: Record<string, any>) {
  if (!p.id) return fail("id obrigatório");
  const inv = await getInvoiceRow(db, p.id);
  const cfg = await fiscalConfigFor(db, inv.user_id);
  const creds = resolveSellerSpedy(cfg?.spedy_api_token ?? null, cfg?.spedy_use_sandbox ?? null);
  const spedyId = inv.spedy_invoice_id || inv.spedy_order_id;
  if (!spedyId) return fail("Nota sem spedy_invoice_id.");
  const res = await spedyFetch(
    creds,
    `product-invoices/${encodeURIComponent(spedyId)}/resend-email`,
    { method: "POST" }
  );
  if (!res.ok) return fail(`Spedy recusou o reenvio: HTTP ${res.status}`);
  return ok({ ok: true });
}

async function actionGetDocument(db: SupabaseClient, p: Record<string, any>) {
  if (!p.id) return fail("id obrigatório");
  const inv = await getInvoiceRow(db, p.id);
  const cfg = await fiscalConfigFor(db, inv.user_id);
  const creds = resolveSellerSpedy(cfg?.spedy_api_token ?? null, cfg?.spedy_use_sandbox ?? null);
  const spedyId = inv.spedy_invoice_id || inv.spedy_order_id;
  if (!spedyId) return fail("Nota sem spedy_invoice_id.");
  // Endpoints de PDF/XML da Spedy não exigem X-Api-Key — devolvemos a URL direta.
  const base = `${creds.baseUrl}product-invoices/${encodeURIComponent(spedyId)}`;
  return ok({ pdf_url: `${base}/pdf`, xml_url: `${base}/xml` });
}

async function actionListWebhooks() {
  const creds = resolveOwnerSpedy();
  const res = await spedyFetch(creds, `webhooks?page=1&pageSize=50`);
  if (!res.ok) return fail(`Spedy recusou listar webhooks: HTTP ${res.status}`);
  const items = Array.isArray(res.json?.items) ? res.json.items : Array.isArray(res.json) ? res.json : [];
  return ok(items);
}

async function actionSetWebhook(p: Record<string, any>) {
  if (!p.id) return fail("id obrigatório");
  const creds = resolveOwnerSpedy();
  const verb = p.enabled ? "enable" : "disable";
  const res = await spedyFetch(creds, `webhooks/${encodeURIComponent(p.id)}/${verb}`, {
    method: "PUT",
  });
  if (!res.ok) return fail(`Spedy recusou ${verb}: HTTP ${res.status}`);
  return ok({ ok: true });
}

// ─────────────────────────────────────────────────────────────────────────
// Empresas na Spedy
//
// Auth: gerenciar empresa exige a chave da EMPRESA TITULAR (a primeira da
// conta) — a doc é explícita: "Requer a chave da empresa titular — a única
// autorizada a gerenciar empresas". Por isso estas ações usam `resolveOwnerSpedy`
// e não o token do seller.
//
// ⚠️ Sandbox e produção da Spedy são CONTAS SEPARADAS: base URL, dados e
// chaves próprias ("uma chave de sandbox não funciona em produção, e
// vice-versa"). O parâmetro `sandbox` escolhe de qual base estamos falando, e
// uma empresa que existe numa não existe na outra.
// ─────────────────────────────────────────────────────────────────────────

/** Owner na base pedida. O `resolveOwnerSpedy` só conhece produção. */
function ownerSpedy(sandbox: boolean): SpedyCreds {
  if (!sandbox) return resolveOwnerSpedy();
  const apiKey = normalizeToken(Deno.env.get("SPEDY_SANDBOX_API_KEY") ?? "");
  if (!apiKey) {
    throw new Error("Spedy sandbox: SPEDY_SANDBOX_API_KEY ausente nas Edge Functions.");
  }
  return { baseUrl: sandboxBaseUrl(), apiKey, sandbox: true };
}

/** Só dígitos: a Spedy devolve o CNPJ sem máscara, o nosso banco guarda com. */
const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/**
 * GET /companies — lista as empresas da conta.
 *
 * ⚠️ A API NÃO tem filtro por CNPJ, só paginação (`page`, `pageSize`). Quando
 * `cnpj` vem, a filtragem é feita aqui, varrendo as páginas. É o que resolve o
 * caso do CNPJ órfão: `POST /companies` recusa com "já possui uma conta
 * vinculada" e a gente não tem o id pra consultar nem apagar.
 */
async function actionCompaniesList(p: Record<string, any>) {
  const sandbox = !!p.sandbox;
  const creds = ownerSpedy(sandbox);
  const alvo = soDigitos(p.cnpj);
  const maxPaginas = Number(p.max_pages ?? 10);
  const pageSize = Number(p.page_size ?? 50);

  const todas: any[] = [];
  for (let page = 1; page <= maxPaginas; page++) {
    const r = await spedyFetch(creds, `companies?page=${page}&pageSize=${pageSize}`);
    if (!r.ok) return fail(`Spedy HTTP ${r.status}: ${r.text}`, 400);
    const itens = Array.isArray(r.json?.items) ? r.json.items : Array.isArray(r.json) ? r.json : [];
    todas.push(...itens);
    if (itens.length < pageSize) break;
  }

  const lista = alvo
    ? todas.filter((c: any) => soDigitos(c?.federalTaxNumber) === alvo)
    : todas;

  return ok({
    sandbox,
    total: todas.length,
    // A chave da empresa NUNCA vem aqui: a doc diz que ela é devolvida
    // "exclusivamente no momento da criação" e depois vem ofuscada.
    companies: lista.map((c: any) => ({
      id: c?.id ?? null,
      name: c?.name ?? null,
      legalName: c?.legalName ?? null,
      federalTaxNumber: c?.federalTaxNumber ?? null,
      email: c?.email ?? null,
      phone: c?.phone ?? null,
      mobilePhone: c?.mobilePhone ?? null,
      address: c?.address ?? null,
    })),
  });
}

/** GET /companies/{id} — a empresa inteira, como a Spedy devolve. */
async function actionCompanyGet(p: Record<string, any>) {
  if (!p.company_id) return fail("company_id obrigatório");
  const creds = ownerSpedy(!!p.sandbox);
  const r = await spedyFetch(creds, `companies/${encodeURIComponent(String(p.company_id))}`);
  if (!r.ok) return fail(`Spedy HTTP ${r.status}: ${r.text}`, 400);
  // Vai cru: o console é admin e a resposta muda com a evolução da API.
  // ⚠️ `apiCredentials.apiKey` vem OFUSCADA aqui (a1b2****-…), não serve pra usar.
  return ok({ sandbox: !!p.sandbox, company: r.json });
}

/**
 * GET /companies/{id}/settings — configurações de emissão.
 *
 * O campo que importa pro nosso controle é `productInvoice.environmentType`:
 * `production` manda a NF-e pra SEFAZ de produção (nota real), `development`
 * pra homologação (sem valor fiscal) e `simulation` simula.
 */
async function actionCompanySettingsGet(p: Record<string, any>) {
  if (!p.company_id) return fail("company_id obrigatório");
  const creds = ownerSpedy(!!p.sandbox);
  const r = await spedyFetch(
    creds,
    `companies/${encodeURIComponent(String(p.company_id))}/settings`
  );
  if (!r.ok) return fail(`Spedy HTTP ${r.status}: ${r.text}`, 400);
  const d = r.json ?? {};
  return ok({
    sandbox: !!p.sandbox,
    general: {
      allowDuplicateFederalTaxNumbers: d?.general?.allowDuplicateFederalTaxNumbers ?? null,
      allowNaturalPersonCompany: d?.general?.allowNaturalPersonCompany ?? null,
      allowMultipleInvoiceModelsPerOrder: d?.general?.allowMultipleInvoiceModelsPerOrder ?? null,
      decimalPrecision: d?.general?.decimalPrecision ?? null,
      taxReformFieldsEnabled: d?.general?.taxReformFieldsEnabled ?? null,
      technicalResponsible: d?.general?.technicalResponsible ?? null,
    },
    productInvoice: {
      series: d?.productInvoice?.series ?? null,
      environmentType: d?.productInvoice?.environmentType ?? null,
      nextNumber: d?.productInvoice?.nextNumber ?? null,
      danfePrintLayout: d?.productInvoice?.danfePrintLayout ?? null,
      inbound: d?.productInvoice?.inbound ?? null,
    },
    consumerInvoice: {
      series: d?.consumerInvoice?.series ?? null,
      environmentType: d?.consumerInvoice?.environmentType ?? null,
      nextNumber: d?.consumerInvoice?.nextNumber ?? null,
      tokenId: d?.consumerInvoice?.tokenId ?? null,
      csc: d?.consumerInvoice?.csc ?? null,
      allowOfflineContingency: d?.consumerInvoice?.allowOfflineContingency ?? null,
    },
    serviceInvoice: {
      series: d?.serviceInvoice?.series ?? null,
      environmentType: d?.serviceInvoice?.environmentType ?? null,
      issueType: d?.serviceInvoice?.issueType ?? null,
      userName: d?.serviceInvoice?.userName ?? null,
      password: d?.serviceInvoice?.password ?? null,
      nextBatchNumber: d?.serviceInvoice?.nextBatchNumber ?? null,
      authNumber: d?.serviceInvoice?.authNumber ?? null,
      nextNumber: d?.serviceInvoice?.nextNumber ?? null,
      sendCityTaxNumber: d?.serviceInvoice?.sendCityTaxNumber ?? null,
    },
  });
}

const AMBIENTES = ["production", "development", "simulation"];

/**
 * PUT /companies/{id}/settings — altera as configurações.
 *
 * Os quatro blocos são INDEPENDENTES: manda-se só o que muda. Por isso o corpo
 * é montado a partir do que veio, sem preencher o resto com null — enviar um
 * bloco inteiro zerado apagaria série e numeração de quem não pediu isso.
 */
async function actionCompanySettingsUpdate(p: Record<string, any>) {
  if (!p.company_id) return fail("company_id obrigatório");

  const corpo: Record<string, unknown> = {};
  for (const bloco of ["general", "productInvoice", "consumerInvoice", "serviceInvoice"]) {
    if (p[bloco] && typeof p[bloco] === "object") corpo[bloco] = p[bloco];
  }

  // Atalho pro caso de uso do console: trocar só o ambiente da NF-e.
  if (p.environment_type) {
    if (!AMBIENTES.includes(String(p.environment_type))) {
      return fail(`environment_type inválido. Use: ${AMBIENTES.join(", ")}`);
    }
    corpo.productInvoice = {
      ...(corpo.productInvoice as Record<string, unknown> | undefined),
      environmentType: String(p.environment_type),
    };
  }

  if (!Object.keys(corpo).length) return fail("Nada pra alterar: mande um bloco ou environment_type");

  const creds = ownerSpedy(!!p.sandbox);

  /**
   * ⚠️ O PUT NÃO mescla dentro do bloco — ele SUBSTITUI o bloco inteiro, e o
   * que não foi enviado volta pro default. Medido em 19/08/2026: um PUT com
   * `productInvoice: { series, nextNumber }` derrubou o `environmentType` de
   * "development" para `0`, ou seja, a empresa saiu de homologação para
   * produção sem ninguém pedir — com auto-emit ligado, o pedido seguinte viraria
   * NF-e real na SEFAZ. O inverso é igualmente destrutivo: trocar o ambiente
   * apagaria série e numeração, e numeração perdida vira rejeição 539.
   *
   * Por isso lê-se o estado atual e mescla campo a campo antes de gravar. Se a
   * leitura falhar, ABORTA: gravar às cegas aqui troca um erro visível por uma
   * mudança silenciosa em ambiente de emissão fiscal.
   */
  const atual = await spedyFetch(
    creds,
    `companies/${encodeURIComponent(String(p.company_id))}/settings`
  );
  if (!atual.ok) {
    return fail(
      `Não deu pra ler as configurações atuais da empresa (HTTP ${atual.status}). ` +
        "Gravar sem elas apagaria ambiente ou numeração — nada foi alterado.",
      400
    );
  }

  const mesclado: Record<string, unknown> = {};
  for (const [bloco, valor] of Object.entries(corpo)) {
    const base = (atual.json?.[bloco] as Record<string, unknown> | undefined) ?? {};
    mesclado[bloco] = { ...base, ...(valor as Record<string, unknown>) };
  }

  const r = await spedyFetch(
    creds,
    `companies/${encodeURIComponent(String(p.company_id))}/settings`,
    { method: "PUT", body: JSON.stringify(mesclado) }
  );
  if (!r.ok) return fail(`Spedy HTTP ${r.status}: ${r.text}`, 400);
  return ok({ sandbox: !!p.sandbox, enviado: mesclado, resposta: r.json });
}

/**
 * GET /companies/{id}/certificates — certificados A1 da empresa.
 *
 * Cada empresa mantém UM ativo; o último enviado substitui o anterior. O que
 * interessa no console é `isActive` e `expirationAt`, porque certificado
 * vencido derruba a emissão e o erro vem da SEFAZ, não da nossa tela.
 */
async function actionCompanyCertificates(p: Record<string, any>) {
  if (!p.company_id) return fail("company_id obrigatório");
  const creds = ownerSpedy(!!p.sandbox);
  const r = await spedyFetch(
    creds,
    `companies/${encodeURIComponent(String(p.company_id))}/certificates`
  );
  if (!r.ok) return fail(`Spedy HTTP ${r.status}: ${r.text}`, 400);
  const itens = Array.isArray(r.json?.items) ? r.json.items : Array.isArray(r.json) ? r.json : [];
  return ok({
    sandbox: !!p.sandbox,
    certificates: itens.map((c: any) => ({
      id: c?.id ?? null,
      isActive: c?.isActive ?? null,
      expirationAt: c?.expirationAt ?? null,
      ...c,
    })),
  });
}

/**
 * Reconcilia o `spedy_company_id` do seller com o que existe na Spedy.
 *
 * Nasceu de um caso real: o `POST /companies` recusou com "O CNPJ já possui uma
 * conta vinculada", mas o `fiscal_configs` estava sem `spedy_company_id` — a
 * empresa existia lá e nós não sabíamos o id. Sem ele o app não consegue nem
 * consultar nem apagar, e o seller fica preso.
 *
 * ⚠️ Isto grava só o ID. A CHAVE da empresa não é recuperável: a doc diz que ela
 * é devolvida "exclusivamente no momento da criação". Sem chave o seller não
 * emite — com o id, ao menos consegue APAGAR pelo app e recriar.
 */
async function actionCompanyLink(db: SupabaseClient, p: Record<string, any>) {
  if (!p.user_id) return fail("user_id obrigatório");
  const cfg = await fiscalConfigFor(db, String(p.user_id));
  if (!cfg) return fail("Seller sem fiscal_config");

  const sandbox = p.sandbox ?? cfg.spedy_use_sandbox ?? false;
  const alvo = soDigitos(p.cnpj ?? cfg.cnpj);
  if (!alvo) return fail("Sem CNPJ pra procurar");

  // ⚠️ `actionCompaniesList` devolve um `Response`, e ler o corpo o CONSOME:
  // repassar o mesmo objeto adiante entregaria uma resposta vazia. Por isso o
  // erro é reembalado num `fail` novo em vez de reencaminhado.
  const body = await (await actionCompaniesList({ sandbox, cnpj: alvo })).json();
  if (!body?.success) return fail(body?.error ?? "Falha ao listar empresas na Spedy", 400);

  const achadas = body.data.companies ?? [];
  if (!achadas.length) {
    return ok({ linked: false, reason: "not_found", sandbox, cnpj: alvo });
  }
  if (achadas.length > 1) {
    return ok({ linked: false, reason: "ambiguous", sandbox, cnpj: alvo, companies: achadas });
  }

  const company = achadas[0];
  if (p.dry_run) return ok({ linked: false, reason: "dry_run", sandbox, company });

  const { error } = await db
    .from("fiscal_configs")
    .update({ spedy_company_id: company.id, updated_at: new Date().toISOString() })
    .eq("user_id", String(p.user_id));
  if (error) throw new Error(error.message);

  return ok({
    linked: true,
    sandbox,
    company,
    aviso:
      "Só o ID foi gravado. A chave da empresa não é recuperável pela API — sem ela o seller não emite, e o caminho é apagar a empresa e recriar.",
  });
}


/** Estado "não cadastrado". Igual ao `docs-company-delete` do app do seller. */
const FISCAL_CONFIG_LIMPO = {
  spedy_company_id: null,
  spedy_active: false,
  spedy_api_token: null,
  certificate_expires_at: null,
};

/**
 * DELETE /companies/{id} — apaga a empresa na Spedy.
 *
 * Porta do `docs-company-delete` do app do seller, com uma diferença que é o
 * motivo desta tela existir: lá o id vem do `fiscal_config` do próprio usuário,
 * então empresa ÓRFÃ (que existe na Spedy e nenhum seller reivindica) é
 * inalcançável — e é justamente a que trava o recadastro do CNPJ. Aqui o id vem
 * da lista.
 *
 * ⚠️ Irreversível: a chave da empresa morre junto e não é recuperável (a Spedy
 * a devolve só na criação). Por isso exige `confirm_cnpj` conferindo com o CNPJ
 * que a própria Spedy reporta pra esse id — apagar a linha errada de uma lista
 * de empresas parecidas não pode ser um clique.
 *
 * Se algum seller apontava pra ela, o `fiscal_config` dele é limpo e o
 * `spedy_enabled` desligado. Sem isso o app dele segue achando que está
 * cadastrado, e o auto-emit dispara a cada pedido pago gravando NF rejeitada
 * com "Empresa não cadastrada na Spedy".
 *
 * Nota já emitida continua válida na SEFAZ: apagar a empresa não desfaz nota.
 */
async function actionDeleteCompany(db: SupabaseClient, p: Record<string, any>) {
  if (!p.company_id) return fail("company_id obrigatório");
  const companyId = String(p.company_id);
  const sandbox = !!p.sandbox;
  const creds = ownerSpedy(sandbox);

  // Confere o CNPJ na fonte, não no que o cliente mandou junto: se a tela
  // estiver com uma lista velha, é aqui que a divergência aparece.
  const atual = await spedyFetch(creds, `companies/${encodeURIComponent(companyId)}`);
  const cnpjReal = soDigitos(atual.json?.federalTaxNumber);
  if (atual.ok && cnpjReal) {
    if (soDigitos(p.confirm_cnpj) !== cnpjReal) {
      return fail("Confirmação não confere com o CNPJ desta empresa na Spedy.");
    }
  } else if (atual.status !== 404) {
    return fail(`Spedy HTTP ${atual.status}: ${atual.text}`, 400);
  }

  // 404 = já não existe lá. Segue mesmo assim: o vínculo local ainda precisa
  // ser limpo, e é exatamente o estado que deixa o seller preso.
  const del =
    atual.status === 404
      ? { ok: true, status: 404, json: null, text: "" }
      : await spedyFetch(creds, `companies/${encodeURIComponent(companyId)}`, { method: "DELETE" });

  if (!del.ok && del.status !== 404) {
    return fail(`Spedy HTTP ${del.status}: ${del.text}`, 400);
  }

  // Sellers que apontavam pra essa empresa (normalmente zero ou um).
  const { data: vinculados } = await db
    .from("fiscal_configs")
    .select("user_id")
    .eq("spedy_company_id", companyId);
  const userIds = (vinculados ?? []).map((v: any) => v.user_id);

  for (const uid of userIds) {
    const { error: e1 } = await db.from("fiscal_configs").update(FISCAL_CONFIG_LIMPO).eq("user_id", uid);
    if (e1) console.error("[bo-fiscal] delete_company: fiscal_config", uid, e1.message);
    const { error: e2 } = await db
      .from("subscriptions")
      .update({ spedy_enabled: false })
      .eq("user_id", uid);
    if (e2) console.error("[bo-fiscal] delete_company: subscriptions", uid, e2.message);
  }

  return ok({
    deleted: true,
    sandbox,
    company_id: companyId,
    alreadyGone: del.status === 404 || atual.status === 404,
    /** Sellers destravados: o cadastro fiscal deles voltou ao estado inicial. */
    sellers_limpos: userIds,
  });
}


/**
 * Todas as contas do sistema, com o estado fiscal de cada uma.
 *
 * Diferente do `list_sellers`, que parte de `fiscal_configs` e por isso só
 * enxerga quem JÁ cadastrou o CNPJ. Aqui a lista parte dos usuários: conta sem
 * cadastro fiscal precisa aparecer, porque "não tem empresa na Spedy" é uma
 * resposta, não uma ausência de linha.
 *
 * Sem contagem de notas de propósito: o `list_sellers` faz 5 consultas de
 * contagem POR seller, e aqui a lista é maior. Quem quer o volume abre a tela
 * de Sellers.
 */
async function actionListAccounts(db: SupabaseClient) {
  // Em lote, não um `emailFor` por usuário — isso viraria uma rajada de
  // requisições ao Auth a cada render da lista.
  //
  // E varrendo as páginas ATÉ O FIM: pedir só a primeira cortava a lista em
  // silêncio assim que a base passasse do tamanho da página, e a tela seguiria
  // dizendo "todas as contas do sistema" mostrando um pedaço. O teto existe
  // como trava de loop, não como limite de produto — se ele for atingido, isso
  // aparece no log em vez de sumir.
  const PAGINA = 1000;
  const MAX_PAGINAS = 20;
  const users: any[] = [];
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGINA });
    if (error) throw new Error(error.message);
    const lote = data?.users ?? [];
    users.push(...lote);
    if (lote.length < PAGINA) break;
    if (page === MAX_PAGINAS) {
      console.warn(
        `[bo-fiscal] list_accounts parou no teto de ${MAX_PAGINAS} páginas ` +
          `(${users.length} contas). Há contas fora da lista.`
      );
    }
  }

  const [{ data: fiscais }, { data: subs }, { data: profiles }] = await Promise.all([
    db.from("fiscal_configs").select(
      "user_id, cnpj, razao_social, spedy_company_id, spedy_active, spedy_use_sandbox, emission_mode, certificate_expires_at"
    ),
    db
      .from("subscriptions")
      .select(
        "user_id, plan, status, spedy_enabled, spedy_environment, current_period_end, cancel_at_period_end, gateway_subscription_id, renewal_card_token"
      ),
    db.from("profiles").select("id, shop_name"),
  ]);

  const porUsuario = <T extends { user_id?: string; id?: string }>(rows: T[] | null, chave: "user_id" | "id") =>
    new Map((rows ?? []).map((r) => [String(r[chave]), r]));

  const fiscalDe = porUsuario(fiscais as any[], "user_id");
  const subDe = porUsuario(subs as any[], "user_id");
  const profDe = porUsuario(profiles as any[], "id");

  const contas = users.map((u: any) => {
    const f = fiscalDe.get(u.id) as any;
    const sub = subDe.get(u.id) as any;
    return {
      user_id: u.id,
      email: u.email ?? null,
      created_at: u.created_at ?? null,
      shop_name: (profDe.get(u.id) as any)?.shop_name ?? null,
      plan: sub?.plan ?? null,
      status: sub?.status ?? null,
      spedy_enabled: sub?.spedy_enabled ?? null,
      // Escolha do painel. NULL = ninguém escolheu; a empresa nasce no padrão
      // da Spedy, que é produção.
      spedy_environment: sub?.spedy_environment ?? null,
      current_period_end: sub?.current_period_end ?? null,
      cancel_at_period_end: !!sub?.cancel_at_period_end,
      // Assinatura dirigida pelo gateway: ou tem recorrência na Asaas, ou tem
      // cartão salvo pro cron cobrar. Mexer na data à mão nessas brigaria com o
      // webhook, então a tela avisa antes.
      gateway_managed: !!(sub?.gateway_subscription_id || sub?.renewal_card_token),
      cnpj: f?.cnpj ?? null,
      razao_social: f?.razao_social ?? null,
      spedy_company_id: f?.spedy_company_id ?? null,
      spedy_active: f?.spedy_active ?? null,
      spedy_use_sandbox: !!f?.spedy_use_sandbox,
      emission_mode: f?.emission_mode ?? null,
      certificate_expires_at: f?.certificate_expires_at ?? null,
    };
  });

  // Quem tem empresa na Spedy primeiro: é onde há o que decidir.
  contas.sort((a, b) => {
    if (!!a.spedy_company_id !== !!b.spedy_company_id) return a.spedy_company_id ? -1 : 1;
    return (a.email ?? "").localeCompare(b.email ?? "");
  });

  return ok(contas);
}

/* ── Plano da conta ───────────────────────────────────────────────────────
   Concessão MANUAL de plano: muda `subscriptions` direto, sem passar pela
   Asaas. Vale pra conta de cortesia, parceiro e teste interno.

   Por que é seguro conviver com as rotinas de cobrança:
   • `billing-renew` só cobra quem tem `renewal_card_token` + `gateway_customer_id`
     + `renewal_installments >= 2`. Concessão manual não tem nada disso, então
     nunca vira cobrança.
   • `expire_overdue_subscriptions` (de hora em hora) derruba `active` pra
     `expired` 3 dias depois de `current_period_end`. A concessão morre sozinha
     no vencimento — é isso que a torna uma concessão e não um presente eterno.
   • `subscription-lifecycle` manda os avisos de 7/3/1 dia antes. A pessoa vai
     receber e-mail de vencimento, o que é o comportamento correto.

   O que NÃO acontece: nada disso cria assinatura na Asaas nem renova sozinho.
   Vencendo, ou o admin estende de novo, ou a pessoa paga pelo fluxo normal. */

/** Os planos que a CHECK de `subscriptions.plan` aceita. */
const PLANOS_VALIDOS = ["tiktally", "pro", "erp", "test"];

/** `tiktally` é o valor de fábrica do gatilho — significa "sem plano escolhido". */
const PLANO_NEUTRO = "tiktally";

/** Catálogo de planos, pro seletor da tela. */
async function actionListPlans(db: SupabaseClient) {
  const { data, error } = await db
    .from("plans")
    .select("key, name, description, status, sort_order")
    .order("sort_order", { nullsFirst: false });
  if (error) throw new Error(error.message);
  // Só o que a CHECK aceita: um plano no catálogo que o banco recusa viraria
  // uma opção no seletor que falha no clique.
  return ok((data ?? []).filter((p: any) => PLANOS_VALIDOS.includes(p.key)));
}

/**
 * Grava plano + janela de acesso numa assinatura.
 *
 * `plan` nulo é "sem plano": status vira `cancelled` e a chave volta pro valor
 * neutro. Não apaga `current_period_end` — a data de quando o acesso terminou
 * é histórico, e zerar faria a tela esquecer até quando a pessoa teve acesso.
 */
async function aplicarPlano(
  db: SupabaseClient,
  userId: string,
  plan: string | null,
  periodEnd: string | null
) {
  const agora = new Date().toISOString();

  if (!plan) {
    const { error } = await db
      .from("subscriptions")
      .update({ plan: PLANO_NEUTRO, status: "cancelled", updated_at: agora })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { plan: null as string | null, status: "cancelled", current_period_end: null };
  }

  const { error } = await db
    .from("subscriptions")
    .update({
      plan,
      status: "active",
      current_period_start: agora,
      current_period_end: periodEnd,
      // Uma concessão manual não pode herdar o "cancelar no fim do período" de
      // um ciclo anterior — senão o acesso que acabou de ser dado já nasce
      // marcado pra morrer na primeira passada do cron.
      cancel_at_period_end: false,
      updated_at: agora,
    })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { plan, status: "active", current_period_end: periodEnd };
}

/**
 * Valida o par (plano, data) vindo da tela.
 *
 * Data no passado é recusada quando há plano: gravar assim daria um acesso que
 * o `expire_overdue_subscriptions` derruba na hora seguinte, e a tela mostraria
 * "ativo" por até uma hora antes de se contradizer sozinha.
 */
function lerPlanoEData(p: Record<string, any>): { plan: string | null; periodEnd: string | null } | string {
  const bruto = p.plan == null || p.plan === "" ? null : String(p.plan);
  if (bruto && !PLANOS_VALIDOS.includes(bruto)) {
    return `Plano inválido. Use: ${PLANOS_VALIDOS.join(", ")}`;
  }
  const plan = bruto === PLANO_NEUTRO ? null : bruto;

  if (!plan) return { plan: null, periodEnd: null };

  const dataBruta = String(p.period_end ?? "").trim();
  if (!dataBruta) return "Informe até quando o acesso vale.";
  const d = new Date(dataBruta);
  if (Number.isNaN(d.getTime())) return "Data de acesso inválida.";
  if (d.getTime() <= Date.now()) {
    return 'A data precisa ser no futuro. Pra tirar o acesso, escolha "sem plano".';
  }
  return { plan, periodEnd: d.toISOString() };
}

/** Define (ou remove) o plano de uma conta que já existe. */
async function actionSetAccountPlan(db: SupabaseClient, p: Record<string, any>, actorId: string) {
  if (!p.user_id) return fail("user_id obrigatório");
  const userId = String(p.user_id);

  const lido = lerPlanoEData(p);
  if (typeof lido === "string") return fail(lido);

  const { data: atual } = await db
    .from("subscriptions")
    .select("plan, status, current_period_end, gateway_subscription_id, renewal_card_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (!atual) return fail("Conta sem assinatura — não dá pra definir plano.", 404);

  const gatewayManaged = !!(atual.gateway_subscription_id || atual.renewal_card_token);

  const novo = await aplicarPlano(db, userId, lido.plan, lido.periodEnd);

  await audit(db, actorId, "account.set_plan", "subscriptions", userId, {
    de: { plan: atual.plan, status: atual.status, current_period_end: atual.current_period_end },
    para: novo,
    gateway_managed: gatewayManaged,
  });

  return ok({ user_id: userId, ...novo, gateway_managed: gatewayManaged });
}

/* ── Cadastro de conta ────────────────────────────────────────────────────
   Documento aqui não é só formato. O CNPJ vira a empresa emissora na Spedy e
   o CPF vai no cadastro fiscal — um dígito trocado só aparece quando a NF-e
   for rejeitada, longe demais de quem digitou. Por isso o dígito verificador
   é conferido no cadastro, e não só o comprimento como faz a tela pública. */

function cpfValido(cpf: string): boolean {
  // Repetido (111.111.111-11) passa no cálculo mas não existe.
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

function cnpjValido(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (ate: number) => {
    let soma = 0;
    let peso = ate - 7;
    for (let i = 0; i < ate; i++) {
      soma += Number(cnpj[i]) * peso;
      peso = peso - 1 < 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(cnpj[12]) && dv(13) === Number(cnpj[13]);
}

/**
 * Cria uma conta do TikTally a partir do backoffice.
 *
 * ## Por que os dados vão em `user_metadata`
 * Três gatilhos disparam em `auth.users`, nesta ordem: `handle_new_user` cria
 * o profile vazio, `handle_new_user_profile` grava cnpj/legal_name/legal_cpf/
 * company_name lendo do `raw_user_meta_data`, e `handle_new_user_subscription`
 * abre a assinatura. Mandar os dados como metadata é o MESMO caminho do signup
 * da tela pública — o cadastro fica atômico com a criação do usuário, em vez
 * de depender de um UPDATE posterior que pode falhar e deixar conta órfã.
 *
 * ## Por que `email_confirm: true`
 * Quem cadastra aqui é o admin, que já sabe de quem é o e-mail. Exigir a
 * confirmação de um e-mail que a pessoa não pediu trava justamente o acesso
 * que acabou de ser concedido. É o mesmo que os cadastros de business e
 * afiliado já fazem no `bo-coupons`.
 *
 * A assinatura nasce `cancelled` (regra do gatilho, igual pra quem se cadastra
 * sozinho). Se o admin escolher um plano no formulário, ele é aplicado LOGO
 * DEPOIS, pelo mesmo caminho do `set_account_plan` — sem plano escolhido, a
 * conta entra com o paywall de pé e o acesso vem do pagamento.
 */
async function actionCreateAccount(db: SupabaseClient, p: Record<string, any>, actorId: string) {
  const email = String(p.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("E-mail inválido");

  // Antes de criar o usuário: um plano inválido depois do `createUser` deixaria
  // a conta criada e o formulário mostrando erro, sem dizer o que aconteceu.
  const plano = lerPlanoEData(p);
  if (typeof plano === "string") return fail(plano);

  const senha = String(p.password ?? "");
  if (senha.length < 8) return fail("Senha deve ter ao menos 8 caracteres");

  const cnpj = soDigitos(p.cnpj);
  if (!cnpjValido(cnpj)) return fail("CNPJ inválido — confira os dígitos.");

  const legalCpf = soDigitos(p.legal_cpf);
  if (!cpfValido(legalCpf)) return fail("CPF do responsável inválido — confira os dígitos.");

  const legalName = String(p.legal_name ?? "").trim();
  if (legalName.length < 3) return fail("Razão social deve ter ao menos 3 caracteres");

  const companyName = String(p.company_name ?? "").trim() || null;
  const shopName = String(p.shop_name ?? "").trim() || null;

  // CNPJ repetido não é bloqueio: o signup público também não impede, e a
  // mesma empresa pode ter mais de uma conta. Mas o admin precisa SABER, senão
  // descobre quando as duas contas brigarem pela mesma empresa na Spedy.
  const { data: mesmoCnpj } = await db.from("profiles").select("id").eq("cnpj", cnpj).limit(1);
  const cnpjDuplicado = !!mesmoCnpj?.length;

  const { data: created, error: cErr } = await db.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: {
      cnpj,
      legal_name: legalName,
      legal_cpf: legalCpf,
      company_name: companyName,
    },
  });
  if (cErr || !created?.user?.id) {
    const msg = cErr?.message ?? "sem user id";
    if (/registered|already|exists/i.test(msg)) {
      return fail("Já existe uma conta com esse e-mail.");
    }
    return fail(`Falha ao criar a conta: ${msg}`);
  }
  const userId = created.user.id;

  // shop_name não passa pelo gatilho — ele só lê os quatro campos do signup.
  if (shopName) {
    await db.from("profiles").update({ shop_name: shopName }).eq("id", userId);
  }

  if (plano.plan) await aplicarPlano(db, userId, plano.plan, plano.periodEnd);

  // Lê o que ficou gravado em vez de repetir o que foi enviado: se um gatilho
  // não rodar, a tela precisa mostrar a conta como ela está, não como devia.
  const [{ data: perfil }, { data: assinatura }] = await Promise.all([
    db.from("profiles").select("cnpj, legal_name, legal_cpf, company_name, shop_name").eq("id", userId).maybeSingle(),
    db
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  await audit(db, actorId, "account.create", "auth.users", userId, {
    email,
    cnpj,
    shop_name: shopName,
    cnpj_duplicado: cnpjDuplicado,
    plan: plano.plan,
    period_end: plano.periodEnd,
  });

  return ok({
    user_id: userId,
    email,
    cnpj_duplicado: cnpjDuplicado,
    // `false` aqui é o sinal de que o gatilho não gravou o cadastro fiscal — a
    // conta existe e loga, mas entra sem CNPJ.
    perfil_gravado: !!perfil?.cnpj,
    plan: assinatura?.plan ?? null,
    subscription_status: assinatura?.status ?? null,
    current_period_end: assinatura?.current_period_end ?? null,
  });
}

/**
 * Ambiente de emissão de várias empresas de uma vez.
 *
 * A tela mostra uma linha por conta, e o ambiente só existe na Spedy: sem isto
 * seriam N chamadas do navegador, uma por linha. As consultas saem em paralelo
 * daqui, e o que volta é um mapa `company_id → ambiente`.
 *
 * Empresa que falha entra no mapa como `null` com o erro ao lado, e não some da
 * resposta: a tela precisa distinguir "não consegui ler" de "não tem empresa",
 * senão a linha mente.
 */
async function actionCompaniesEnvironments(p: Record<string, any>) {
  const ids: string[] = Array.isArray(p.company_ids) ? p.company_ids.filter(Boolean).map(String) : [];
  if (!ids.length) return ok({ sandbox: !!p.sandbox, environments: {} });

  const creds = ownerSpedy(!!p.sandbox);
  const resultados = await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await spedyFetch(creds, `companies/${encodeURIComponent(id)}/settings`);
        if (!r.ok) return [id, { environmentType: null, erro: `HTTP ${r.status}` }] as const;
        return [
          id,
          {
            environmentType: r.json?.productInvoice?.environmentType ?? null,
            series: r.json?.productInvoice?.series ?? null,
            erro: null,
          },
        ] as const;
      } catch (e) {
        return [id, { environmentType: null, erro: e instanceof Error ? e.message : "erro" }] as const;
      }
    })
  );

  return ok({ sandbox: !!p.sandbox, environments: Object.fromEntries(resultados) });
}


/**
 * Define o ambiente de emissão de uma CONTA, tenha ela empresa na Spedy ou não.
 *
 * É um controle só pra dois momentos diferentes, de propósito:
 *
 * - **Já tem empresa**: grava a escolha e aplica AGORA no `PUT
 *   /companies/{id}/settings`. Sem aplicar, o painel mostraria uma escolha que
 *   a Spedy não conhece.
 * - **Ainda não tem**: grava a escolha, e o `docs-company-setup` a aplica logo
 *   depois de criar a empresa. Isso fecha a janela entre o seller cadastrar o
 *   CNPJ e alguém lembrar de trocar o ambiente à mão — janela em que um pedido
 *   pago vira NF-e real.
 *
 * A escolha mora em `subscriptions` porque precisa existir antes do cadastro
 * fiscal: `fiscal_configs` exige cnpj, razão social e endereço.
 */
async function actionSetAccountEnvironment(db: SupabaseClient, p: Record<string, any>) {
  if (!p.user_id) return fail("user_id obrigatório");
  const env = String(p.environment_type ?? "");
  if (!AMBIENTES.includes(env)) {
    return fail(`environment_type inválido. Use: ${AMBIENTES.join(", ")}`);
  }

  const { error: subErr } = await db
    .from("subscriptions")
    .update({ spedy_environment: env })
    .eq("user_id", String(p.user_id));
  if (subErr) throw new Error(subErr.message);

  const cfg = await fiscalConfigFor(db, String(p.user_id));
  const companyId = cfg?.spedy_company_id?.trim();

  if (!companyId) {
    return ok({ saved: true, applied: false, reason: "sem_empresa", environment: env });
  }

  const creds = ownerSpedy(!!cfg?.spedy_use_sandbox);
  const r = await spedyFetch(
    creds,
    `companies/${encodeURIComponent(companyId)}/settings`,
    { method: "PUT", body: JSON.stringify({ productInvoice: { environmentType: env } }) }
  );

  // A escolha continua gravada mesmo se a Spedy recusar: ela vale pro próximo
  // cadastro. Mas o retorno diz que NÃO aplicou, pra tela não fingir sucesso.
  if (!r.ok) {
    return ok({
      saved: true,
      applied: false,
      reason: "spedy_recusou",
      erro: `HTTP ${r.status}: ${r.text}`.slice(0, 300),
      environment: env,
    });
  }

  return ok({ saved: true, applied: true, environment: env, company_id: companyId });
}


/**
 * Cancela uma NF-e autorizada.
 *
 * `DELETE /v1/product-invoices/{id}` com `{ reason }`, autenticado com a chave
 * DA EMPRESA (a doc é explícita: "cada empresa cadastrada possui sua própria
 * Chave de API"). Não é operação de titular, diferente de gerenciar empresa.
 *
 * ⚠️ O campo é `reason`. O schema é `CancelInvoiceRequestDto` e a propriedade
 * obrigatória chama `reason` — o app do seller mandava `justification`, que não
 * existe, então o cancelamento dele nunca teve chance de funcionar.
 *
 * ## Justificativa tem mínimo de 15 caracteres
 * A Spedy aceita `minLength: 1`, mas quem recusa é a SEFAZ: o campo `xJust` do
 * layout da NF-e exige de 15 a 255 caracteres. Validar aqui transforma uma
 * rejeição que voltaria depois, assíncrona, num erro imediato e explicável.
 *
 * ## O cancelamento é assíncrono
 * O 200 diz que a Spedy ACEITOU o pedido, não que a SEFAZ cancelou. Por isso a
 * nota fica em `processing` e não em `cancelled`: quem confirma é o
 * `cron-nfe-status`, que relê o status real e grava o desfecho. Marcar como
 * cancelada aqui seria afirmar um resultado que ninguém viu.
 */
async function actionCancelInvoice(db: SupabaseClient, p: Record<string, any>) {
  if (!p.id) return fail("id obrigatório");

  const reason = String(p.reason ?? "").trim();
  if (reason.length < 15) {
    return fail(
      `A justificativa precisa de pelo menos 15 caracteres (a SEFAZ exige 15 a 255 no campo xJust). Você escreveu ${reason.length}.`
    );
  }
  if (reason.length > 255) {
    return fail(`A justificativa passa de 255 caracteres (${reason.length}). Encurte.`);
  }

  const inv = await getInvoiceRow(db, p.id);

  // Só nota AUTORIZADA se cancela. Rejeitada não existe na SEFAZ, e nota em
  // processamento ainda não tem o que cancelar — mandar assim volta um 400 da
  // Spedy que não explica nada pra quem está na tela.
  if (inv.status !== "authorized") {
    return fail(
      `Só dá pra cancelar nota autorizada. Esta está como "${inv.status}".` +
        (inv.status === "rejected" ? " Nota rejeitada não chegou a existir na SEFAZ." : "")
    );
  }

  const spedyId = inv.spedy_invoice_id || inv.spedy_order_id;
  if (!spedyId) return fail("Nota sem id da Spedy — não dá pra cancelar.");

  const cfg = await fiscalConfigFor(db, inv.user_id);
  const creds = resolveSellerSpedy(cfg?.spedy_api_token ?? null, cfg?.spedy_use_sandbox ?? null);

  const res = await spedyFetch(creds, `product-invoices/${encodeURIComponent(spedyId)}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });

  if (!res.ok) {
    const msg =
      res.json?.errors?.[0]?.message || res.json?.message || res.text || `HTTP ${res.status}`;
    return fail(`Spedy recusou o cancelamento: ${msg}`);
  }

  // A resposta traz o ProductInvoiceDto com o status DAQUELE INSTANTE — e o
  // cancelamento é assíncrono, então ali ele ainda é `Authorized`. Aceitar esse
  // eco regravava "autorizada" por cima do pedido que acabou de ser aceito, e a
  // nota ficava presa: o `cron-nfe-status` só reconcilia `processing`/`pending`,
  // então nada nunca mais olhava pra ela. Só um `cancelled` explícito vale como
  // desfecho; qualquer outra coisa vira `processing` pro cron confirmar.
  const statusBruto = String(res.json?.status ?? "");
  const normalizado: Status =
    statusBruto && mapSpedyStatus(statusBruto) === "cancelled" ? "cancelled" : "processing";

  const updates: Record<string, unknown> = {
    ...extractInvoiceUpdates(res.json ?? {}, normalizado),
    cancel_reason: reason,
  };
  // `cancelled_at` só quando a SEFAZ confirmou. Carimbar a data no pedido
  // aceito faria a tela dizer "cancelada em X" para uma nota que ainda pode
  // voltar recusada.
  if (normalizado === "cancelled") updates.cancelled_at = new Date().toISOString();

  const { data: updated, error } = await db
    .from("invoices")
    .update(updates)
    .eq("id", inv.id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  console.log("[bo-fiscal] cancelamento aceito | invoice", inv.id, "| status Spedy:", statusBruto || "(vazio)");

  return ok({ ...updated, sandbox: creds.sandbox, spedy_status: statusBruto || null });
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

    // ── Dispatch ──
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const action = String(body.action ?? "");

    switch (action) {
      case "metrics":
        return await actionMetrics(db);
      case "list_invoices":
        return await actionListInvoices(db, body);
      case "get_invoice":
        return await actionGetInvoice(db, body);
      case "list_sellers":
        return await actionListSellers(db);
      case "check_status":
        return await actionCheckStatus(db, body);
      case "cancel_invoice":
        return await actionCancelInvoice(db, body);
      case "reprocess":
        return await actionReprocess(db, body);
      case "resend_email":
        return await actionResendEmail(db, body);
      case "get_document":
        return await actionGetDocument(db, body);
      case "list_webhooks":
        return await actionListWebhooks();
      case "set_webhook":
        return await actionSetWebhook(body);
      case "list_companies":
        return await actionCompaniesList(body);
      case "get_company":
        return await actionCompanyGet(body);
      case "get_company_settings":
        return await actionCompanySettingsGet(body);
      case "set_company_settings":
        return await actionCompanySettingsUpdate(body);
      case "list_company_certificates":
        return await actionCompanyCertificates(body);
      case "set_account_environment":
        return await actionSetAccountEnvironment(db, body);
      case "create_account":
        return await actionCreateAccount(db, body, actorId);
      case "list_plans":
        return await actionListPlans(db);
      case "set_account_plan":
        return await actionSetAccountPlan(db, body, actorId);
      case "list_accounts":
        return await actionListAccounts(db);
      case "companies_environments":
        return await actionCompaniesEnvironments(body);
      case "delete_company":
        return await actionDeleteCompany(db, body);
      case "link_company":
        return await actionCompanyLink(db, body);
      default:
        return fail(`Ação desconhecida: ${action || "(vazia)"}`);
    }
  } catch (err) {
    console.error("[bo-fiscal] erro:", err);
    return fail(err instanceof Error ? err.message : "Erro interno", 500);
  }
});
