/**
 * bo-coupons — Gateway do Backoffice de Cupons da TikTally.
 *
 * Console admin para GERIR os cupons que o app principal já usa (tabela
 * `coupons` de desconto/trial, resgatados por billing-validate-coupon /
 * billing-redeem-trial). NÃO cria schema novo — opera as tabelas existentes:
 *   - coupons            (PERCENTAGE | FIXED | TRIAL_DAYS)
 *   - coupon_redemptions (histórico de resgates)
 *
 * Um cupom criado aqui funciona no TikTally imediatamente — é a mesma tabela
 * que o checkout/paywall lê.
 *
 * Segurança (idêntica ao bo-fiscal):
 *  - Exige JWT de usuário (verify_jwt). Dentro, valida profiles.is_admin via
 *    service-role. Quem não é admin recebe 403.
 *  - Leitura/escrita cross-tenant via service-role (bypassa RLS).
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

// Domínios válidos (espelham _shared/asaas/config.ts do app principal).
const DISCOUNT_KINDS = ["PERCENTAGE", "FIXED", "TRIAL_DAYS"] as const;
const STATUSES = ["ACTIVE", "INACTIVE"] as const;
const PLANS = ["pro", "erp"] as const;
const CYCLES = ["semiannually", "yearly"] as const;

const COUPON_COLS =
  "id, code, description, discount_kind, discount, status, max_redeems, redeems_count, valid_from, valid_until, applicable_plans, applicable_cycles, metadata, created_at, updated_at";

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

async function emailFor(db: SupabaseClient, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

/** -1 (ou negativo) = ilimitado. Espelha isCouponExhausted do app. */
function isExhausted(c: { max_redeems: number | null; redeems_count: number | null }) {
  const max = c.max_redeems ?? -1;
  if (max < 0) return false;
  return (c.redeems_count ?? 0) >= max;
}

function normalizeCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

async function codeExists(db: SupabaseClient, code: string, excludeId?: string): Promise<boolean> {
  let q = db.from("coupons").select("id").eq("code", code);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.limit(1);
  return !!(data && data.length);
}

function sanitizeArray(input: unknown, allowed: readonly string[]): string[] | null {
  if (!Array.isArray(input)) return null;
  const out = input.map(String).filter((v) => allowed.includes(v));
  return out.length ? out : null;
}

/** Valida e normaliza os campos de um cupom (create/update). */
function pickCouponFields(p: Record<string, any>, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (p.description !== undefined) out.description = p.description ? String(p.description) : null;

  if (p.discount_kind !== undefined) {
    if (!DISCOUNT_KINDS.includes(p.discount_kind)) throw new Error("discount_kind inválido");
    out.discount_kind = p.discount_kind;
  }
  if (p.discount !== undefined) {
    const n = Number(p.discount);
    if (!Number.isFinite(n)) throw new Error("discount inválido");
    out.discount = Math.round(n);
  }
  if (p.status !== undefined) {
    if (!STATUSES.includes(p.status)) throw new Error("status inválido");
    out.status = p.status;
  }
  if (p.max_redeems !== undefined) {
    out.max_redeems = p.max_redeems === "" || p.max_redeems == null ? -1 : Math.round(Number(p.max_redeems));
  }
  if (p.valid_from !== undefined) out.valid_from = p.valid_from || null;
  if (p.valid_until !== undefined) out.valid_until = p.valid_until || null;
  if (p.applicable_plans !== undefined) out.applicable_plans = sanitizeArray(p.applicable_plans, PLANS);
  if (p.applicable_cycles !== undefined) out.applicable_cycles = sanitizeArray(p.applicable_cycles, CYCLES);

  // Coerência do discount conforme o tipo (usa valor final, considerando partial).
  const kind = (out.discount_kind ?? (partial ? undefined : "PERCENTAGE")) as string | undefined;
  if (out.discount !== undefined && kind) {
    const d = out.discount as number;
    if (kind === "PERCENTAGE" && (d < 0 || d > 100)) throw new Error("Percentual deve estar entre 0 e 100");
    if (kind === "FIXED" && d < 0) throw new Error("Valor fixo (centavos) não pode ser negativo");
    if (kind === "TRIAL_DAYS" && d < 1) throw new Error("Dias de trial deve ser ≥ 1");
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────

async function actionOverview(db: SupabaseClient, p: Record<string, any>) {
  const days = [7, 30, 90].includes(Number(p.period)) ? Number(p.period) : 30;
  const since = new Date(Date.now() - days * 864e5).toISOString();

  const [
    totalCoupons,
    activeCoupons,
    { data: allReds },
    { data: periodReds },
    { data: kinds },
  ] = await Promise.all([
    db.from("coupons").select("*", { count: "exact", head: true }),
    db.from("coupons").select("*", { count: "exact", head: true }).eq("status", "ACTIVE"),
    db.from("coupon_redemptions").select("discount_cents, coupon_id, billing_id"),
    db.from("coupon_redemptions").select("redeemed_at").gte("redeemed_at", since).limit(10000),
    db.from("coupons").select("id, code, discount_kind, redeems_count"),
  ]);

  const reds = allReds ?? [];
  const discount_given_cents = reds.reduce((a: number, r: any) => a + Number(r.discount_cents ?? 0), 0);
  const trial_redemptions = reds.filter((r: any) => r.billing_id == null).length;

  // top cupons por resgates (usa redeems_count desnormalizado da própria coupons)
  const top_coupons = (kinds ?? [])
    .map((c: any) => ({ coupon_id: c.id, code: c.code, redeems: Number(c.redeems_count ?? 0), discount_kind: c.discount_kind }))
    .sort((a, b) => b.redeems - a.redeems)
    .slice(0, 10);

  // série temporal por dia
  const buckets = new Map<string, number>();
  for (const r of periodReds ?? []) {
    const day = String(r.redeemed_at ?? "").slice(0, 10);
    if (day) buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  const by_day = [...buckets.entries()]
    .map(([day, redemptions]) => ({ day, redemptions }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return ok({
    period_days: days,
    total_coupons: totalCoupons.count ?? 0,
    active_coupons: activeCoupons.count ?? 0,
    total_redemptions: reds.length,
    redemptions_in_period: (periodReds ?? []).length,
    discount_given_cents,
    trial_redemptions,
    by_day,
    top_coupons,
  });
}

async function actionListCoupons(db: SupabaseClient, p: Record<string, any>) {
  const page = Math.max(1, Number(p.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(p.page_size ?? 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const build = (q: any) => {
    if (p.status) q = q.eq("status", p.status);
    if (p.discount_kind) q = q.eq("discount_kind", p.discount_kind);
    if (p.search) {
      const term = String(p.search).replace(/[,()%]/g, "").trim();
      if (term) q = q.or(`code.ilike.%${term}%,description.ilike.%${term}%`);
    }
    return q;
  };

  const { count } = await build(db.from("coupons").select("*", { count: "exact", head: true }));
  const { data, error } = await build(
    db.from("coupons").select(COUPON_COLS).order("created_at", { ascending: false }).range(from, to)
  );
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((c: any) => ({ ...c, exhausted: isExhausted(c) }));
  const total = count ?? 0;
  return ok({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

async function actionGetCoupon(db: SupabaseClient, p: Record<string, any>) {
  if (!p.id) return fail("id obrigatório");
  const { data: coupon, error } = await db.from("coupons").select(COUPON_COLS).eq("id", p.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!coupon) return fail("Cupom não encontrado", 404);

  const { data: reds } = await db
    .from("coupon_redemptions")
    .select("id, coupon_id, user_id, billing_id, subscription_id, discount_cents, redeemed_at")
    .eq("coupon_id", coupon.id)
    .order("redeemed_at", { ascending: false })
    .limit(200);

  const redemptions = await Promise.all(
    (reds ?? []).map(async (r: any) => ({ ...r, user_email: await emailFor(db, r.user_id) }))
  );
  return ok({ coupon: { ...coupon, exhausted: isExhausted(coupon) }, redemptions });
}

async function actionCheckCode(db: SupabaseClient, p: Record<string, any>) {
  const code = normalizeCode(p.code);
  if (!code) return ok({ code, available: false, reason: "Código vazio" });
  if (!/^[A-Z0-9]{3,32}$/.test(code)) return ok({ code, available: false, reason: "Use 3–32 letras/números" });
  const exists = await codeExists(db, code, p.exclude_id ? String(p.exclude_id) : undefined);
  return ok({ code, available: !exists, reason: exists ? "Código já em uso" : null });
}

async function actionCreateCoupon(db: SupabaseClient, p: Record<string, any>) {
  const code = normalizeCode(p.code);
  if (!/^[A-Z0-9]{3,32}$/.test(code)) return fail("Código inválido (use 3–32 letras/números)");
  if (p.discount_kind === undefined) return fail("discount_kind obrigatório");
  if (p.discount === undefined) return fail("discount obrigatório");
  if (await codeExists(db, code)) return fail("Já existe um cupom com esse código");

  const fields = pickCouponFields(p, false);
  const insert = {
    code,
    status: fields.status ?? "ACTIVE",
    max_redeems: fields.max_redeems ?? -1,
    ...fields,
  };
  const { data, error } = await db.from("coupons").insert(insert).select(COUPON_COLS).single();
  if (error) throw new Error(error.message);
  return ok({ ...data, exhausted: isExhausted(data) });
}

async function actionUpdateCoupon(db: SupabaseClient, p: Record<string, any>) {
  if (!p.id) return fail("id obrigatório");
  const { data: current } = await db.from("coupons").select("id").eq("id", p.id).maybeSingle();
  if (!current) return fail("Cupom não encontrado", 404);

  const updates = pickCouponFields(p, true);
  if (p.code !== undefined) {
    const code = normalizeCode(p.code);
    if (!/^[A-Z0-9]{3,32}$/.test(code)) return fail("Código inválido");
    if (await codeExists(db, code, String(p.id))) return fail("Já existe um cupom com esse código");
    updates.code = code;
  }
  if (!Object.keys(updates).length) return fail("Nada para atualizar");
  updates.updated_at = new Date().toISOString();

  const { data, error } = await db.from("coupons").update(updates).eq("id", p.id).select(COUPON_COLS).single();
  if (error) throw new Error(error.message);
  return ok({ ...data, exhausted: isExhausted(data) });
}

async function actionListRedemptions(db: SupabaseClient, p: Record<string, any>) {
  const page = Math.max(1, Number(p.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(p.page_size ?? 50)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const build = (q: any) => {
    if (p.coupon_id) q = q.eq("coupon_id", p.coupon_id);
    if (p.only_trial === true) q = q.is("billing_id", null);
    if (p.only_discount === true) q = q.not("billing_id", "is", null);
    if (p.from) q = q.gte("redeemed_at", p.from);
    if (p.to) q = q.lte("redeemed_at", p.to);
    return q;
  };

  const { count } = await build(db.from("coupon_redemptions").select("*", { count: "exact", head: true }));
  const { data, error } = await build(
    db
      .from("coupon_redemptions")
      .select("id, coupon_id, user_id, billing_id, subscription_id, discount_cents, redeemed_at")
      .order("redeemed_at", { ascending: false })
      .range(from, to)
  );
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const couponIds = [...new Set(rows.map((r: any) => r.coupon_id))];
  const { data: coupons } = couponIds.length
    ? await db.from("coupons").select("id, code, discount_kind").in("id", couponIds)
    : { data: [] as any[] };
  const codeById = new Map((coupons ?? []).map((c: any) => [c.id, { code: c.code, kind: c.discount_kind }]));

  const items = await Promise.all(
    rows.map(async (r: any) => ({
      ...r,
      coupon_code: codeById.get(r.coupon_id)?.code ?? null,
      coupon_kind: codeById.get(r.coupon_id)?.kind ?? null,
      user_email: await emailFor(db, r.user_id),
    }))
  );

  const total = count ?? 0;
  return ok({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
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
      case "overview":
        return await actionOverview(db, body);
      case "list_coupons":
        return await actionListCoupons(db, body);
      case "get_coupon":
        return await actionGetCoupon(db, body);
      case "create_coupon":
        return await actionCreateCoupon(db, body);
      case "update_coupon":
        return await actionUpdateCoupon(db, body);
      case "check_code":
        return await actionCheckCode(db, body);
      case "list_redemptions":
        return await actionListRedemptions(db, body);
      default:
        return fail(`Ação desconhecida: ${action || "(vazia)"}`);
    }
  } catch (err) {
    console.error("[bo-coupons] erro:", err);
    return fail(err instanceof Error ? err.message : "Erro interno", 500);
  }
});
