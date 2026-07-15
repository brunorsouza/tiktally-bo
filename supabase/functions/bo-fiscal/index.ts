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
      default:
        return fail(`Ação desconhecida: ${action || "(vazia)"}`);
    }
  } catch (err) {
    console.error("[bo-fiscal] erro:", err);
    return fail(err instanceof Error ? err.message : "Erro interno", 500);
  }
});
