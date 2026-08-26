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
  "id, code, description, discount_kind, discount, status, max_redeems, redeems_count, valid_from, valid_until, applicable_plans, applicable_cycles, affiliate_id, business_id, applies_to_renewals, metadata, created_at, updated_at";
const AFFILIATE_COLS =
  "id, user_id, business_id, name, email, pix_key, status, default_commission_type, default_commission_value, created_at, updated_at";
const BUSINESS_COLS = "id, owner_user_id, name, email, status, notes, created_at, updated_at";
const COMMISSION_COLS =
  "id, redemption_id, affiliate_id, business_id, amount_cents, commission_type, commission_value, status, eligible_at, approved_at, paid_at, paid_by, payment_reference, notes, created_at, updated_at";

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

/**
 * Mascara e-mail de assinante para quem NÃO é admin (LGPD, spec §3):
 * "joao.silva@gmail.com" → "jo***@gmail.com".
 */
function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  const head = user.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, 3))}@${domain}`;
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

/**
 * Expirado por DATA. O `status` da tabela continua 'ACTIVE' — a expiração é
 * derivada, igual ao checkout faz (isCouponExpired). Sem derivar aqui, a tela
 * mostrava "Ativo" num cupom que o checkout já recusava como expirado.
 */
function isExpired(c: { valid_until: string | null }) {
  return !!c.valid_until && new Date(c.valid_until).getTime() < Date.now();
}

/** Ainda não entrou em vigor (valid_from no futuro). */
function isScheduled(c: { valid_from?: string | null }) {
  return !!c.valid_from && new Date(c.valid_from).getTime() > Date.now();
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
  if (p.valid_until !== undefined) {
    out.valid_until = p.valid_until || null;
    // Cupom não pode NASCER expirado. Aconteceu de verdade: um cupom criado
    // com validade dois meses no passado ficava listado como "Ativo" no
    // backoffice enquanto o checkout o recusava como expirado.
    //
    // Só barra na CRIAÇÃO (`partial === false`): numa edição, pôr uma data
    // passada é a forma legítima de encerrar um cupom na hora.
    if (!partial && out.valid_until) {
      const ts = new Date(out.valid_until as string).getTime();
      if (Number.isFinite(ts) && ts < Date.now()) {
        throw new Error("A validade já passou. Escolha uma data futura ou deixe em branco para não expirar.");
      }
    }
  }
  if (p.applicable_plans !== undefined) out.applicable_plans = sanitizeArray(p.applicable_plans, PLANS);
  if (p.applicable_cycles !== undefined) out.applicable_cycles = sanitizeArray(p.applicable_cycles, CYCLES);
  if (p.affiliate_id !== undefined) out.affiliate_id = p.affiliate_id ? String(p.affiliate_id) : null;
  if (p.business_id !== undefined) out.business_id = p.business_id ? String(p.business_id) : null;
  if (p.applies_to_renewals !== undefined) out.applies_to_renewals = p.applies_to_renewals !== false;

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

/** % padrão do cupom de afiliado (settings). */
async function couponDefaultPercent(db: SupabaseClient): Promise<number> {
  const { data } = await db.from("settings").select("value").eq("key", "coupon_discount_percent").maybeSingle();
  const n = typeof data?.value === "number" ? data.value : Number(data?.value);
  return Number.isFinite(n) ? n : 20;
}

/** Pool de gestão (%): comissão = pool − desconto do cupom. */
async function commissionPoolPercent(db: SupabaseClient): Promise<number> {
  const { data } = await db.from("settings").select("value").eq("key", "commission_pool_percent").maybeSingle();
  const n = typeof data?.value === "number" ? data.value : Number(data?.value);
  return Number.isFinite(n) ? n : 20;
}

/** Opções de desconto que o business pode escolher. */
const BUSINESS_COUPON_PERCENTS = [5, 10, 15] as const;
/** Sem afiliado (cupom da própria conta), o teto é o menor da faixa. */
const BUSINESS_OWN_COUPON_MAX_PERCENT = 5;

/**
 * Valida o desconto de um cupom criado/editado por um BUSINESS.
 * - cupom da própria conta (sem afiliado): até 5%
 * - cupom de afiliado da carteira: até 15%
 * Sempre um dos valores da tabela (5 / 10 / 15).
 *
 * Escala trocada em 24/08/2026: a TikTally passou de 70% para 80% do valor de
 * tabela, então o pool caiu de 30 para 20 e a faixa desceu junto. Um cupom de
 * 20% agora consumiria o pool inteiro e zeraria a comissão.
 */
function validateBusinessCouponPercent(pct: number, hasAffiliate: boolean): string | null {
  if (!BUSINESS_COUPON_PERCENTS.includes(pct as (typeof BUSINESS_COUPON_PERCENTS)[number])) {
    return `Desconto inválido. Escolha ${BUSINESS_COUPON_PERCENTS.join("%, ")}%.`;
  }
  if (!hasAffiliate && pct > BUSINESS_OWN_COUPON_MAX_PERCENT) {
    return `Cupom da própria conta é limitado a ${BUSINESS_OWN_COUPON_MAX_PERCENT}%. Para ${pct}%, vincule um afiliado da carteira.`;
  }
  return null;
}

/**
 * Remove do payload os campos que o BUSINESS não pode alterar. O desconto é
 * tratado à parte (permitido dentro da tabela 10/15/20 e do teto por tipo).
 */
function stripBusinessLockedCouponFields(updates: Record<string, unknown>) {
  delete updates.discount_kind;
  delete updates.applies_to_renewals;
  delete updates.affiliate_id;
  delete updates.business_id;
  delete updates.applicable_plans;
  delete updates.applicable_cycles;
}

async function actionListCoupons(db: SupabaseClient, p: Record<string, any>) {
  const page = Math.max(1, Number(p.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(p.page_size ?? 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const build = (q: any) => {
    if (p.status) q = q.eq("status", p.status);
    if (p.discount_kind) q = q.eq("discount_kind", p.discount_kind);
    // Escopo do business: cupons da própria conta OU dos afiliados da carteira.
    if (p.__business_scope) {
      const { businessId, affiliateIds } = p.__business_scope as { businessId: string; affiliateIds: string[] };
      const parts = [`business_id.eq.${businessId}`];
      if (affiliateIds.length) parts.push(`affiliate_id.in.(${affiliateIds.join(",")})`);
      q = q.or(parts.join(","));
    }
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

  const items = (data ?? []).map((c: any) => ({ ...c, exhausted: isExhausted(c), expired: isExpired(c), scheduled: isScheduled(c) }));
  const total = count ?? 0;
  return ok({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

async function actionGetCoupon(db: SupabaseClient, p: Record<string, any>, ctx: RoleCtx) {
  if (!p.id) return fail("id obrigatório");
  if (ctx.role === "business" && !(await couponInWallet(db, ctx.businessId!, String(p.id)))) {
    return fail("Cupom fora da sua carteira.", 403);
  }
  const { data: coupon, error } = await db.from("coupons").select(COUPON_COLS).eq("id", p.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!coupon) return fail("Cupom não encontrado", 404);

  const { data: reds } = await db
    .from("coupon_redemptions")
    .select("id, coupon_id, user_id, billing_id, subscription_id, discount_cents, redeemed_at, affiliate_id, business_id, plan_key, cycle, payment_method, gross_amount_cents, net_amount_cents, status")
    .eq("coupon_id", coupon.id)
    .order("redeemed_at", { ascending: false })
    .limit(200);

  // LGPD: parceiro vê assinante mascarado e sem user_id; só admin vê completo.
  const redemptions = await Promise.all(
    (reds ?? []).map(async (r: any) => {
      const email = await emailFor(db, r.user_id);
      return {
        ...r,
        user_email: ctx.role === "admin" ? email : maskEmail(email),
        user_id: ctx.role === "admin" ? r.user_id : undefined,
      };
    })
  );
  return ok({ coupon: { ...coupon, exhausted: isExhausted(coupon), expired: isExpired(coupon), scheduled: isScheduled(coupon) }, redemptions });
}

async function actionCheckCode(db: SupabaseClient, p: Record<string, any>) {
  const code = normalizeCode(p.code);
  if (!code) return ok({ code, available: false, reason: "Código vazio" });
  if (!/^[A-Z0-9]{3,32}$/.test(code)) return ok({ code, available: false, reason: "Use 3–32 letras/números" });
  const exists = await codeExists(db, code, p.exclude_id ? String(p.exclude_id) : undefined);
  return ok({ code, available: !exists, reason: exists ? "Código já em uso" : null });
}

async function actionCreateCoupon(db: SupabaseClient, p: Record<string, any>, ctx: RoleCtx, actorId: string) {
  const code = normalizeCode(p.code);
  if (!/^[A-Z0-9]{3,32}$/.test(code)) return fail("Código inválido (use 3–32 letras/números)");

  // Business: cupom SEMPRE de um afiliado da carteira, % travado no padrão do
  // programa e desconto vitalício ligado (spec §3).
  if (ctx.role === "business") {
    const hasAffiliate = !!p.affiliate_id;
    if (hasAffiliate && !(await affiliateInWallet(db, ctx.businessId!, String(p.affiliate_id)))) {
      return fail("Afiliado fora da sua carteira.", 403);
    }
    const pct = Math.round(Number(p.discount ?? (await couponDefaultPercent(db))));
    const err = validateBusinessCouponPercent(pct, hasAffiliate);
    if (err) return fail(err);

    p.discount_kind = "PERCENTAGE";
    p.discount = pct;
    p.applies_to_renewals = true;
    p.business_id = ctx.businessId; // dono; se houver afiliado, ele é o vendedor
    delete p.applicable_plans;
    delete p.applicable_cycles;
  }

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
  await audit(db, actorId, "coupon.create", "coupons", data.id, insert);
  return ok({ ...data, exhausted: isExhausted(data), expired: isExpired(data), scheduled: isScheduled(data) });
}

async function actionUpdateCoupon(db: SupabaseClient, p: Record<string, any>, ctx: RoleCtx, actorId: string) {
  if (!p.id) return fail("id obrigatório");
  const { data: current } = await db.from("coupons").select("id").eq("id", p.id).maybeSingle();
  if (!current) return fail("Cupom não encontrado", 404);
  if (ctx.role === "business" && !(await couponInWallet(db, ctx.businessId!, String(p.id)))) {
    return fail("Cupom fora da sua carteira.", 403);
  }

  const updates = pickCouponFields(p, true);
  if (ctx.role === "business") {
    // Desconto pode mudar, mas só dentro da tabela e do teto do tipo de cupom.
    if (updates.discount !== undefined) {
      const { data: cur } = await db.from("coupons").select("affiliate_id").eq("id", p.id).maybeSingle();
      const err = validateBusinessCouponPercent(Number(updates.discount), !!cur?.affiliate_id);
      if (err) return fail(err);
    }
    stripBusinessLockedCouponFields(updates); // trava tipo, renovações, afiliado, planos/ciclos
  }
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
  await audit(db, actorId, "coupon.update", "coupons", String(p.id), updates);
  return ok({ ...data, exhausted: isExhausted(data), expired: isExpired(data), scheduled: isScheduled(data) });
}

/**
 * Remove um cupom. Regra da spec (§5.5): NUNCA hard delete se já houve resgate
 * — nesse caso vira ARCHIVED (soft delete, some das listas e bloqueia novos
 * usos; assinaturas existentes mantêm o desconto). Sem resgate, apaga de fato.
 */
async function actionDeleteCoupon(db: SupabaseClient, p: Record<string, any>, actorId: string, ctx: RoleCtx) {
  if (!p.id) return fail("id obrigatório");
  const id = String(p.id);
  if (ctx.role === "business" && !(await couponInWallet(db, ctx.businessId!, id))) {
    return fail("Cupom fora da sua carteira.", 403);
  }

  const { data: coupon } = await db.from("coupons").select("id, code, redeems_count").eq("id", id).maybeSingle();
  if (!coupon) return fail("Cupom não encontrado", 404);

  const { count: redCount } = await db
    .from("coupon_redemptions")
    .select("*", { count: "exact", head: true })
    .eq("coupon_id", id);
  const used = (redCount ?? 0) > 0 || Number(coupon.redeems_count ?? 0) > 0;

  if (used) {
    const { error } = await db
      .from("coupons")
      .update({ status: "ARCHIVED", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await audit(db, actorId, "coupon.archive", "coupons", id, { code: coupon.code, redemptions: redCount ?? 0 });
    return ok({ id, deleted: false, archived: true, reason: "Cupom já foi resgatado — foi arquivado em vez de excluído." });
  }

  const { error } = await db.from("coupons").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await audit(db, actorId, "coupon.delete", "coupons", id, { code: coupon.code });
  return ok({ id, deleted: true, archived: false, reason: null });
}

async function actionListRedemptions(db: SupabaseClient, p: Record<string, any>, ctx: RoleCtx) {
  const page = Math.max(1, Number(p.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(p.page_size ?? 50)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const build = (q: any) => {
    if (p.coupon_id) q = q.eq("coupon_id", p.coupon_id);
    // Escopo forçado por papel (o gate já preencheu esses campos).
    if (p.affiliate_id) q = q.eq("affiliate_id", p.affiliate_id);
    if (p.business_id) q = q.eq("business_id", p.business_id);
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
      .select("id, coupon_id, user_id, billing_id, subscription_id, discount_cents, redeemed_at, affiliate_id, business_id, plan_key, cycle, payment_method, gross_amount_cents, net_amount_cents, status")
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
    rows.map(async (r: any) => {
      const email = await emailFor(db, r.user_id);
      return {
        ...r,
        coupon_code: codeById.get(r.coupon_id)?.code ?? null,
        coupon_kind: codeById.get(r.coupon_id)?.kind ?? null,
        // LGPD: parceiro vê assinante mascarado; só admin vê o e-mail completo.
        user_email: ctx.role === "admin" ? email : maskEmail(email),
        // Identificadores de correlação do assinante — não vão pra parceiro.
        user_id: ctx.role === "admin" ? r.user_id : undefined,
        billing_id: ctx.role === "admin" ? r.billing_id : undefined,
        subscription_id: ctx.role === "admin" ? r.subscription_id : undefined,
      };
    })
  );

  const total = count ?? 0;
  return ok({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

// ─────────────────────────────────────────────────────────────────────────
// Auditoria
// ─────────────────────────────────────────────────────────────────────────

async function audit(
  db: SupabaseClient,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  payload: Record<string, unknown> = {}
) {
  try {
    await db.from("audit_logs").insert({ actor_user_id: actorId, action, entity, entity_id: String(entityId), payload });
  } catch (e) {
    console.error("[bo-coupons] audit falhou:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Planos & Preços
// ─────────────────────────────────────────────────────────────────────────

async function actionListPricing(db: SupabaseClient) {
  const [{ data: plans }, { data: prices }, { data: settings }] = await Promise.all([
    db.from("plans").select("id, key, name, description, status, sort_order").order("sort_order"),
    db.from("prices").select("id, plan_id, cycle, installments, installment_amount_cents, total_amount_cents, active").eq("active", true),
    db.from("settings").select("key, value, description").order("key"),
  ]);
  return ok({
    plans: plans ?? [],
    prices: prices ?? [],
    settings: settings ?? [],
    test_plan: testPlanState(settings ?? []),
  });
}

/**
 * Estado das três camadas da trava do plano de teste, pra tela não operar às
 * cegas. Só chega aqui quem é admin (a action é admin-only pelo deny-by-default
 * do RBAC), então listar os e-mails autorizados é aceitável — e necessário:
 * ligar um plano sem saber quem ele libera é pior.
 *
 * Os e-mails são READ-ONLY: mudar quem entra exige o secret no Supabase, de
 * propósito, pra um admin não conseguir se auto-conceder Pro por R$10.
 */
function testPlanState(settings: Array<{ key: string; value: unknown }>) {
  const master = (Deno.env.get("TEST_PLAN_ENABLED") ?? "").trim().toLowerCase() === "true";
  const emails = (Deno.env.get("TEST_PLAN_ALLOWED_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  const raw = settings.find((s) => s.key === "test_plan_enabled")?.value;
  const toggle = raw === true || String(raw).trim().toLowerCase() === "true";
  return {
    /** Freio de emergência (secret) — só muda pelo Supabase. */
    master_enabled: master,
    /** Toggle desta tela (settings.test_plan_enabled). */
    setting_enabled: toggle,
    /** Efetivo: precisa das duas + allowlist não vazia. */
    effective: master && toggle && emails.length > 0,
    allowed_emails: emails,
  };
}

async function actionUpdatePrice(db: SupabaseClient, p: Record<string, any>, actorId: string) {
  if (!p.id) return fail("id obrigatório");
  const updates: Record<string, unknown> = {};
  if (p.installment_amount_cents !== undefined) updates.installment_amount_cents = Math.round(Number(p.installment_amount_cents));
  if (p.total_amount_cents !== undefined) updates.total_amount_cents = Math.round(Number(p.total_amount_cents));
  if (p.installments !== undefined) updates.installments = Math.round(Number(p.installments));
  if (!Object.keys(updates).length) return fail("Nada para atualizar");
  // Preço ZERO/negativo não pode passar: o front exibiria R$ 0,00 enquanto o
  // checkout cairia no fallback e cobraria o preço cheio.
  for (const [k, v] of Object.entries(updates)) {
    if (!Number.isFinite(v as number) || (v as number) <= 0) return fail(`Valor inválido em ${k}: use um número maior que zero.`);
  }
  // Invariante da tabela: parcela × N == total. Sem isso, landing e tela de
  // planos anunciam parcelas diferentes pro mesmo plano.
  const { data: cur } = await db
    .from("prices")
    .select("installments, installment_amount_cents, total_amount_cents")
    .eq("id", p.id)
    .maybeSingle();
  if (cur) {
    const inst = Number(updates.installments ?? cur.installments);
    const parcela = Number(updates.installment_amount_cents ?? cur.installment_amount_cents);
    const total = Number(updates.total_amount_cents ?? cur.total_amount_cents);
    if (parcela * inst !== total) {
      return fail(
        `Preço inconsistente: ${inst}× ${(parcela / 100).toFixed(2)} = ${((parcela * inst) / 100).toFixed(2)}, ` +
          `mas o total informado é ${(total / 100).toFixed(2)}.`
      );
    }
  }
  updates.updated_at = new Date().toISOString();
  const { data, error } = await db.from("prices").update(updates).eq("id", p.id).select("*").single();
  if (error) throw new Error(error.message);
  await audit(db, actorId, "price.update", "prices", String(p.id), updates);
  return ok(data);
}

async function actionUpdateSetting(db: SupabaseClient, p: Record<string, any>, actorId: string) {
  if (!p.key) return fail("key obrigatório");
  if (p.value === undefined) return fail("value obrigatório");
  const { data, error } = await db
    .from("settings")
    .update({ value: p.value, updated_at: new Date().toISOString(), updated_by: actorId })
    .eq("key", String(p.key))
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(db, actorId, "settings.update", "settings", String(p.key), { value: p.value });
  return ok(data);
}

// ─────────────────────────────────────────────────────────────────────────
// Afiliados
// ─────────────────────────────────────────────────────────────────────────

const AFFILIATE_STATUS = ["active", "suspended"] as const;
const COMMISSION_TYPES = ["fixed", "percent"] as const;

function pickAffiliateFields(p: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.name !== undefined) out.name = String(p.name).trim();
  if (p.email !== undefined) out.email = p.email ? String(p.email).trim() : null;
  if (p.business_id !== undefined) out.business_id = p.business_id || null;
  if (p.pix_key !== undefined) out.pix_key = p.pix_key ? String(p.pix_key).trim() : null;
  if (p.status !== undefined) {
    if (!AFFILIATE_STATUS.includes(p.status)) throw new Error("status inválido");
    out.status = p.status;
  }
  if (p.default_commission_type !== undefined) {
    if (!COMMISSION_TYPES.includes(p.default_commission_type)) throw new Error("default_commission_type inválido");
    out.default_commission_type = p.default_commission_type;
  }
  if (p.default_commission_value !== undefined) {
    const n = Number(p.default_commission_value);
    if (!Number.isFinite(n) || n < 0) throw new Error("default_commission_value inválido");
    out.default_commission_value = n;
  }
  return out;
}

/** IDs dos afiliados da carteira de um business (base do escopo de cupom). */
async function walletAffiliateIds(db: SupabaseClient, businessId: string): Promise<string[]> {
  const { data } = await db.from("affiliates").select("id").eq("business_id", businessId);
  return (data ?? []).map((a: any) => a.id as string);
}

/** true se o afiliado pertence à carteira do business. */
async function affiliateInWallet(db: SupabaseClient, businessId: string, affiliateId: string): Promise<boolean> {
  const { data } = await db
    .from("affiliates")
    .select("id")
    .eq("id", affiliateId)
    .eq("business_id", businessId)
    .maybeSingle();
  return !!data;
}

/** true se o cupom é do business (da própria conta) ou de um afiliado da carteira. */
async function couponInWallet(db: SupabaseClient, businessId: string, couponId: string): Promise<boolean> {
  const { data: c } = await db.from("coupons").select("affiliate_id, business_id").eq("id", couponId).maybeSingle();
  if (!c) return false;
  if (c.business_id === businessId) return true;
  if (!c.affiliate_id) return false;
  return affiliateInWallet(db, businessId, c.affiliate_id as string);
}

async function actionListAffiliates(db: SupabaseClient, p: Record<string, any>) {
  const page = Math.max(1, Number(p.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(p.page_size ?? 50)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const build = (q: any) => {
    if (p.business_id) q = q.eq("business_id", p.business_id);
    if (p.status) q = q.eq("status", p.status);
    if (p.search) {
      const term = String(p.search).replace(/[,()%]/g, "").trim();
      if (term) q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
    }
    return q;
  };
  const { count } = await build(db.from("affiliates").select("*", { count: "exact", head: true }));
  const { data, error } = await build(
    db.from("affiliates").select(AFFILIATE_COLS).order("created_at", { ascending: false }).range(from, to)
  );
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const bizIds = [...new Set(rows.map((r: any) => r.business_id).filter(Boolean))];
  const { data: bizs } = bizIds.length ? await db.from("businesses").select("id, name").in("id", bizIds) : { data: [] as any[] };
  const bizById = new Map((bizs ?? []).map((b: any) => [b.id, b.name]));
  const items = rows.map((r: any) => ({ ...r, business_name: r.business_id ? bizById.get(r.business_id) ?? null : null }));
  const total = count ?? 0;
  return ok({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

async function actionCreateAffiliate(db: SupabaseClient, p: Record<string, any>, actorId: string, ctx: RoleCtx) {
  if (!p.name || !String(p.name).trim()) return fail("Nome obrigatório");
  const fields = pickAffiliateFields(p);
  // Business só cria dentro da PRÓPRIA carteira (ignora business_id do cliente).
  if (ctx.role === "business") fields.business_id = ctx.businessId;
  const insert = { status: "active", default_commission_type: "percent", default_commission_value: 0, ...fields };
  const { data, error } = await db.from("affiliates").insert(insert).select(AFFILIATE_COLS).single();
  if (error) throw new Error(error.message);
  await audit(db, actorId, "affiliate.create", "affiliates", data.id, insert);
  return ok(data);
}

async function actionUpdateAffiliate(db: SupabaseClient, p: Record<string, any>, actorId: string, ctx: RoleCtx) {
  if (!p.id) return fail("id obrigatório");
  const updates = pickAffiliateFields(p);
  if (ctx.role === "business") {
    if (!(await affiliateInWallet(db, ctx.businessId!, String(p.id)))) {
      return fail("Afiliado fora da sua carteira.", 403);
    }
    delete updates.business_id; // não pode mover afiliado pra outra carteira
  }
  if (!Object.keys(updates).length) return fail("Nada para atualizar");
  updates.updated_at = new Date().toISOString();
  const { data, error } = await db.from("affiliates").update(updates).eq("id", p.id).select(AFFILIATE_COLS).single();
  if (error) throw new Error(error.message);
  await audit(db, actorId, "affiliate.update", "affiliates", String(p.id), updates);
  return ok(data);
}

/**
 * Remove um afiliado. Só apaga de verdade quem NÃO tem histórico — comissões e
 * resgates são registro financeiro (commissions tem FK ON DELETE CASCADE, então
 * apagar levaria junto). Com histórico, o afiliado é SUSPENSO (soft delete).
 */
async function actionDeleteAffiliate(db: SupabaseClient, p: Record<string, any>, actorId: string, ctx: RoleCtx) {
  if (!p.id) return fail("id obrigatório");
  const id = String(p.id);
  if (ctx.role === "business" && !(await affiliateInWallet(db, ctx.businessId!, id))) {
    return fail("Afiliado fora da sua carteira.", 403);
  }

  const [{ count: comCount }, { count: redCount }, { data: coupons }, { data: aff }] = await Promise.all([
    db.from("commissions").select("*", { count: "exact", head: true }).eq("affiliate_id", id),
    db.from("coupon_redemptions").select("*", { count: "exact", head: true }).eq("affiliate_id", id),
    db.from("coupons").select("id, redeems_count").eq("affiliate_id", id),
    db.from("affiliates").select("user_id").eq("id", id).maybeSingle(),
  ]);

  // Ter CUPOM conta como histórico. Antes, apagar o afiliado desvinculava os
  // cupons (viravam "da casa") — o que permitia burlar o teto de 10% do cupom
  // da própria conta: criar afiliado → cupom de 20% → apagar o afiliado.
  // Ter LOGIN vinculado também conta como histórico: o hard delete apagaria a
  // linha do afiliado mas NÃO o usuário do Auth, deixando conta órfã (e
  // permitindo farmar contas em loop). Nesses casos, suspende.
  const hasHistory =
    (comCount ?? 0) > 0 || (redCount ?? 0) > 0 || (coupons?.length ?? 0) > 0 || !!aff?.user_id;
  if (hasHistory) {
    const { error } = await db
      .from("affiliates")
      .update({ status: "suspended", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await audit(db, actorId, "affiliate.suspend_instead_of_delete", "affiliates", id, {
      commissions: comCount ?? 0,
      redemptions: redCount ?? 0,
      coupons: coupons?.length ?? 0,
    });
    const why = (coupons?.length ?? 0) > 0 && (comCount ?? 0) === 0 && (redCount ?? 0) === 0
      ? "Afiliado tem cupom vinculado — foi suspenso em vez de excluído. Exclua os cupons dele primeiro."
      : "Afiliado tem histórico — foi suspenso em vez de excluído.";
    return ok({ id, deleted: false, suspended: true, reason: why });
  }

  // Sem cupons e sem histórico: pode apagar de fato.
  const { error } = await db.from("affiliates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await audit(db, actorId, "affiliate.delete", "affiliates", id, {});
  return ok({ id, deleted: true, suspended: false, reason: null });
}

// ─────────────────────────────────────────────────────────────────────────
// Businesses
// ─────────────────────────────────────────────────────────────────────────

async function actionListBusinesses(db: SupabaseClient, p: Record<string, any>) {
  const build = (q: any) => {
    if (p.status) q = q.eq("status", p.status);
    if (p.search) {
      const term = String(p.search).replace(/[,()%]/g, "").trim();
      if (term) q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
    }
    return q;
  };
  const { data, error } = await build(db.from("businesses").select(BUSINESS_COLS).order("created_at", { ascending: false }));
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const { data: affs } = await db.from("affiliates").select("business_id");
  const counts = new Map<string, number>();
  for (const a of affs ?? []) {
    if (a.business_id) counts.set(a.business_id, (counts.get(a.business_id) ?? 0) + 1);
  }
  const items = rows.map((b: any) => ({ ...b, affiliates_count: counts.get(b.id) ?? 0 }));
  return ok({ items });
}

async function actionCreateBusiness(db: SupabaseClient, p: Record<string, any>, actorId: string) {
  if (!p.name || !String(p.name).trim()) return fail("Nome obrigatório");
  if (p.status !== undefined && !["active", "suspended"].includes(p.status)) return fail("status inválido");
  const insert = {
    name: String(p.name).trim(),
    email: p.email ? String(p.email).trim() : null,
    status: p.status ?? "active",
    notes: p.notes ? String(p.notes) : null,
  };
  const { data, error } = await db.from("businesses").insert(insert).select(BUSINESS_COLS).single();
  if (error) throw new Error(error.message);
  await audit(db, actorId, "business.create", "businesses", data.id, insert);
  return ok(data);
}

async function actionUpdateBusiness(db: SupabaseClient, p: Record<string, any>, actorId: string) {
  if (!p.id) return fail("id obrigatório");
  const updates: Record<string, unknown> = {};
  if (p.name !== undefined) updates.name = String(p.name).trim();
  if (p.email !== undefined) updates.email = p.email ? String(p.email).trim() : null;
  if (p.notes !== undefined) updates.notes = p.notes ? String(p.notes) : null;
  if (p.status !== undefined) {
    if (!["active", "suspended"].includes(p.status)) return fail("status inválido");
    updates.status = p.status;
  }
  if (!Object.keys(updates).length) return fail("Nada para atualizar");
  updates.updated_at = new Date().toISOString();
  const { data, error } = await db.from("businesses").update(updates).eq("id", p.id).select(BUSINESS_COLS).single();
  if (error) throw new Error(error.message);
  await audit(db, actorId, "business.update", "businesses", String(p.id), updates);
  return ok(data);
}

// ─────────────────────────────────────────────────────────────────────────
// Comissões
// ─────────────────────────────────────────────────────────────────────────

async function actionListCommissions(db: SupabaseClient, p: Record<string, any>) {
  const page = Math.max(1, Number(p.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(p.page_size ?? 50)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const nowIso = new Date().toISOString();
  const build = (q: any) => {
    if (p.affiliate_id) q = q.eq("affiliate_id", p.affiliate_id);
    if (p.business_id) q = q.eq("business_id", p.business_id);
    if (p.status === "eligible") q = q.eq("status", "pending").lte("eligible_at", nowIso);
    else if (p.status) q = q.eq("status", p.status);
    return q;
  };
  const { count } = await build(db.from("commissions").select("*", { count: "exact", head: true }));
  const { data, error } = await build(
    db.from("commissions").select(COMMISSION_COLS).order("created_at", { ascending: false }).range(from, to)
  );
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const affIds = [...new Set(rows.map((r: any) => r.affiliate_id).filter(Boolean))];
  const { data: affs } = affIds.length ? await db.from("affiliates").select("id, name, pix_key").in("id", affIds) : { data: [] as any[] };
  const affById = new Map((affs ?? []).map((a: any) => [a.id, a]));
  const items = rows.map((r: any) => ({
    ...r,
    affiliate_name: affById.get(r.affiliate_id)?.name ?? null,
    affiliate_pix_key: affById.get(r.affiliate_id)?.pix_key ?? null,
    eligible: r.status === "pending" && !!r.eligible_at && r.eligible_at <= nowIso,
  }));
  const total = count ?? 0;
  return ok({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

async function actionApproveCommission(db: SupabaseClient, p: Record<string, any>, actorId: string) {
  if (!p.id) return fail("id obrigatório");
  const { data: c } = await db.from("commissions").select("id, status, eligible_at").eq("id", p.id).maybeSingle();
  if (!c) return fail("Comissão não encontrada", 404);
  if (c.status !== "pending") return fail(`Só comissões pendentes podem ser aprovadas (atual: ${c.status})`);
  if (!c.eligible_at || c.eligible_at > new Date().toISOString()) return fail("Comissão ainda não está elegível (janela de 7 dias)");
  const { data, error } = await db
    .from("commissions")
    .update({ status: "approved", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", p.id)
    .select(COMMISSION_COLS)
    .single();
  if (error) throw new Error(error.message);
  await audit(db, actorId, "commission.approve", "commissions", String(p.id), {});
  return ok(data);
}

async function actionPayCommission(db: SupabaseClient, p: Record<string, any>, actorId: string) {
  if (!p.id) return fail("id obrigatório");
  const { data: c } = await db.from("commissions").select("id, status").eq("id", p.id).maybeSingle();
  if (!c) return fail("Comissão não encontrada", 404);
  if (c.status !== "approved") return fail(`Só comissões aprovadas podem ser pagas (atual: ${c.status})`);
  const updates = {
    status: "paid",
    paid_at: new Date().toISOString(),
    paid_by: actorId,
    payment_reference: p.payment_reference ? String(p.payment_reference) : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from("commissions").update(updates).eq("id", p.id).select(COMMISSION_COLS).single();
  if (error) throw new Error(error.message);
  await audit(db, actorId, "commission.pay", "commissions", String(p.id), { payment_reference: updates.payment_reference });
  return ok(data);
}

async function actionReverseCommission(db: SupabaseClient, p: Record<string, any>, actorId: string) {
  if (!p.id) return fail("id obrigatório");
  if (!p.reason || !String(p.reason).trim()) return fail("Motivo obrigatório para estorno");
  const { data: c } = await db.from("commissions").select("id, status").eq("id", p.id).maybeSingle();
  if (!c) return fail("Comissão não encontrada", 404);
  if (!["approved", "paid"].includes(c.status)) return fail(`Só comissões aprovadas/pagas podem ser estornadas (atual: ${c.status})`);
  const { data, error } = await db
    .from("commissions")
    .update({ status: "reversed", notes: String(p.reason), updated_at: new Date().toISOString() })
    .eq("id", p.id)
    .select(COMMISSION_COLS)
    .single();
  if (error) throw new Error(error.message);
  await audit(db, actorId, "commission.reverse", "commissions", String(p.id), { reason: String(p.reason) });
  return ok(data);
}

// ─────────────────────────────────────────────────────────────────────────
// RBAC — resolução de papel + acesso Business/Afiliado (Fase 6)
// ─────────────────────────────────────────────────────────────────────────

type Role = "admin" | "business" | "affiliate" | "none";
interface RoleCtx {
  role: Role;
  businessId: string | null;
  affiliateId: string | null;
}

/** Deriva o papel do usuário: admin > dono de business > afiliado. */
async function resolveRole(db: SupabaseClient, userId: string): Promise<RoleCtx> {
  const { data: profile } = await db.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  if (profile?.is_admin) return { role: "admin", businessId: null, affiliateId: null };
  // Parceiro SUSPENSO perde o acesso — antes o status era ignorado aqui, e
  // suspender no admin não cortava nada (o suspenso seguia com CRUD e ainda
  // podia trocar a própria chave PIX antes de um pagamento de comissão).
  const { data: biz } = await db
    .from("businesses")
    .select("id, status")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (biz) {
    if (biz.status !== "active") return { role: "none", businessId: null, affiliateId: null };
    return { role: "business", businessId: biz.id as string, affiliateId: null };
  }
  const { data: aff } = await db
    .from("affiliates")
    .select("id, business_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (aff) {
    if (aff.status !== "active") return { role: "none", businessId: null, affiliateId: null };
    return { role: "affiliate", businessId: (aff.business_id as string) ?? null, affiliateId: aff.id as string };
  }
  return { role: "none", businessId: null, affiliateId: null };
}

/** Papel + escopo do usuário logado — o front usa pra rotear pro painel certo. */
async function actionMe(db: SupabaseClient, ctx: RoleCtx, actorId: string) {
  let scopeName: string | null = null;
  if (ctx.role === "business" && ctx.businessId) {
    const { data } = await db.from("businesses").select("name").eq("id", ctx.businessId).maybeSingle();
    scopeName = data?.name ?? null;
  } else if (ctx.role === "affiliate" && ctx.affiliateId) {
    const { data } = await db.from("affiliates").select("name").eq("id", ctx.affiliateId).maybeSingle();
    scopeName = data?.name ?? null;
  }
  // % padrão do cupom: o business não pode ler `settings`, mas precisa exibir o
  // valor travado no form. Vai junto aqui (parâmetro do programa, não é dado sensível).
  const [couponPercent, pool] = await Promise.all([couponDefaultPercent(db), commissionPoolPercent(db)]);
  return ok({
    user_id: actorId,
    role: ctx.role,
    business_id: ctx.businessId,
    affiliate_id: ctx.affiliateId,
    scope_name: scopeName,
    coupon_discount_percent: couponPercent,
    // Regras do programa que a UI precisa exibir/validar.
    commission_pool_percent: pool,
    coupon_percent_options: BUSINESS_COUPON_PERCENTS,
    own_coupon_max_percent: BUSINESS_OWN_COUPON_MAX_PERCENT,
  });
}

/** Base pública do app (link de divulgação do cupom). */
const APP_BASE_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://tiktally.com.br";

/**
 * Painel do afiliado: o(s) cupom(ns) dele + desempenho consolidado + link de
 * divulgação. Somente leitura, escopo forçado pelo ctx.
 */
async function actionMyPerformance(db: SupabaseClient, ctx: RoleCtx) {
  if (!ctx.affiliateId) return fail("Escopo do afiliado não resolvido.", 403);

  const { data: aff } = await db
    .from("affiliates")
    .select("id, name, pix_key, status, business_id")
    .eq("id", ctx.affiliateId)
    .maybeSingle();

  const { data: coupons } = await db
    .from("coupons")
    .select("id, code, description, discount, discount_kind, status, max_redeems, redeems_count, valid_until, applies_to_renewals")
    .eq("affiliate_id", ctx.affiliateId)
    .order("created_at", { ascending: false });

  const list = (coupons ?? []).map((c: any) => ({
    ...c,
    exhausted: isExhausted(c),
    expired: isExpired(c),
    share_url: `${APP_BASE_URL}/plans?cupom=${encodeURIComponent(c.code)}`,
  }));

  // Desempenho: usos (resgates) e comissões do afiliado.
  const [{ count: uses }, { data: reds }, { data: comms }] = await Promise.all([
    db.from("coupon_redemptions").select("*", { count: "exact", head: true }).eq("affiliate_id", ctx.affiliateId),
    db
      .from("coupon_redemptions")
      .select("redeemed_at, status, net_amount_cents")
      .eq("affiliate_id", ctx.affiliateId)
      .order("redeemed_at", { ascending: false })
      .limit(500),
    db.from("commissions").select("amount_cents, status").eq("affiliate_id", ctx.affiliateId),
  ]);

  const commissions = comms ?? [];
  const sum = (pred: (c: any) => boolean) =>
    commissions.filter(pred).reduce((a: number, c: any) => a + Number(c.amount_cents ?? 0), 0);

  // Série por dia (últimos 30d) pro gráfico de acompanhamento.
  const since = Date.now() - 30 * 864e5;
  const buckets = new Map<string, number>();
  for (const r of reds ?? []) {
    const t = new Date(String(r.redeemed_at ?? "")).getTime();
    if (!Number.isFinite(t) || t < since) continue;
    const day = String(r.redeemed_at).slice(0, 10);
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }

  return ok({
    affiliate: aff ? { id: aff.id, name: aff.name, pix_key: aff.pix_key, status: aff.status } : null,
    coupons: list,
    performance: {
      uses: uses ?? 0,
      active_subscriptions: (reds ?? []).filter((r: any) => r.status === "active").length,
      revenue_cents: (reds ?? []).reduce((a: number, r: any) => a + Number(r.net_amount_cents ?? 0), 0),
      commission_pending_cents: sum((c) => c.status === "pending" || c.status === "approved"),
      commission_paid_cents: sum((c) => c.status === "paid"),
      by_day: [...buckets.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day)),
    },
  });
}

/** Afiliado edita a PRÓPRIA chave PIX (spec §8). */
async function actionUpdateMyPix(db: SupabaseClient, p: Record<string, any>, actorId: string, ctx: RoleCtx) {
  if (!ctx.affiliateId) return fail("Escopo do afiliado não resolvido.", 403);
  const pix = p.pix_key === null || p.pix_key === "" ? null : String(p.pix_key).trim();
  if (pix && pix.length > 140) return fail("Chave PIX inválida");
  const { data, error } = await db
    .from("affiliates")
    .update({ pix_key: pix, updated_at: new Date().toISOString() })
    .eq("id", ctx.affiliateId)
    .select("id, pix_key")
    .single();
  if (error) throw new Error(error.message);
  await audit(db, actorId, "affiliate.update_own_pix", "affiliates", ctx.affiliateId, {});
  return ok(data);
}

/**
 * Dá acesso ao AFILIADO: cria um login novo ou vincula uma conta existente ao
 * `affiliates.user_id`.
 *
 * Sem isso o afiliado não existe como usuário: `resolveRole` identifica
 * afiliado por `user_id`, então ele caía em role 'none' → 403, e o anti-fraude
 * de auto-uso (`aff.user_id === user.id`) nunca disparava.
 *
 * @param mode "create" (e-mail + senha) | "link" (conta que já existe)
 */
async function actionAffiliateUser(
  db: SupabaseClient,
  p: Record<string, any>,
  actorId: string,
  ctx: RoleCtx,
  mode: "create" | "link",
) {
  if (!p.affiliate_id) return fail("affiliate_id obrigatório");
  const affiliateId = String(p.affiliate_id);
  const email = String(p.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("E-mail inválido");

  // Business só mexe na própria carteira.
  if (ctx.role === "business" && !(await affiliateInWallet(db, ctx.businessId!, affiliateId))) {
    return fail("Afiliado fora da sua carteira.", 403);
  }

  const { data: aff } = await db.from("affiliates").select("id, user_id, name").eq("id", affiliateId).maybeSingle();
  if (!aff) return fail("Afiliado não encontrado", 404);
  if (aff.user_id) return fail("Este afiliado já tem um acesso vinculado");

  let userId: string;

  if (mode === "link") {
    const { data: found, error: rpcErr } = await db.rpc("bo_user_id_by_email", { p_email: email });
    if (rpcErr) throw new Error(rpcErr.message);
    if (!found) return fail('Nenhuma conta encontrada com esse e-mail. Use "Criar conta nova".', 404);
    userId = found as string;
  } else {
    if (!p.password || String(p.password).length < 8) return fail("Senha deve ter ao menos 8 caracteres");
    const { data: created, error: cErr } = await db.auth.admin.createUser({
      email,
      password: String(p.password),
      email_confirm: true,
    });
    if (cErr || !created?.user?.id) {
      const msg = cErr?.message ?? "sem user id";
      if (/registered|already|exists/i.test(msg)) {
        return fail(
          "Já existe uma conta com esse e-mail (ex.: login do TikTally). " +
            'Use "Vincular conta existente".'
        );
      }
      return fail(`Falha ao criar acesso: ${msg}`);
    }
    userId = created.user.id;
  }

  // Uma conta = no máximo um afiliado, e não pode ser dona de um business
  // (evita escopo ambíguo no RBAC, onde business tem prioridade).
  const { data: otherAff } = await db
    .from("affiliates")
    .select("id, name")
    .eq("user_id", userId)
    .maybeSingle();
  if (otherAff) return fail(`Essa conta já é do afiliado "${otherAff.name}".`);

  const { data: ownedBiz } = await db
    .from("businesses")
    .select("id, name")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (ownedBiz) return fail(`Essa conta já é dona do business "${ownedBiz.name}" — use outra.`);

  const { error: linkErr } = await db
    .from("affiliates")
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq("id", affiliateId);
  if (linkErr) throw new Error(linkErr.message);

  await audit(db, actorId, `affiliate.${mode}_user`, "affiliates", affiliateId, { email });
  return ok({ affiliate_id: affiliateId, user_id: userId, email, linked: mode === "link" });
}

/** Admin cria um login (Supabase Auth) e vincula ao business (owner_user_id). */
async function actionCreateBusinessUser(db: SupabaseClient, p: Record<string, any>, actorId: string) {
  if (!p.business_id) return fail("business_id obrigatório");
  const email = String(p.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("E-mail inválido");
  if (!p.password || String(p.password).length < 8) return fail("Senha deve ter ao menos 8 caracteres");

  const { data: biz } = await db.from("businesses").select("id, owner_user_id").eq("id", p.business_id).maybeSingle();
  if (!biz) return fail("Business não encontrado", 404);
  if (biz.owner_user_id) return fail("Este business já tem um acesso vinculado");

  const { data: created, error: cErr } = await db.auth.admin.createUser({
    email,
    password: String(p.password),
    email_confirm: true,
  });
  if (cErr || !created?.user?.id) {
    const msg = cErr?.message ?? "sem user id";
    if (/registered|already|exists/i.test(msg)) {
      return fail(
        "Já existe uma conta com esse e-mail (ex.: login do TikTally Seller). " +
          'Use "Vincular conta existente" — a mesma conta pode ser seller e dona do business.'
      );
    }
    return fail(`Falha ao criar acesso: ${msg}`);
  }
  const newUserId = created.user.id;

  const { error: linkErr } = await db
    .from("businesses")
    .update({ owner_user_id: newUserId, updated_at: new Date().toISOString() })
    .eq("id", p.business_id);
  if (linkErr) throw new Error(linkErr.message);

  await audit(db, actorId, "business.create_user", "businesses", String(p.business_id), { email });
  return ok({ business_id: p.business_id, user_id: newUserId, email });
}

/**
 * Vincula uma conta JÁ EXISTENTE (mesmo Supabase Auth do app) a um business.
 * Caso comum: o dono já usa o e-mail pra logar no TikTally Seller — a mesma
 * conta vira dona do business, sem duplicar login nem tocar na senha dela.
 */
async function actionLinkBusinessUser(db: SupabaseClient, p: Record<string, any>, actorId: string) {
  if (!p.business_id) return fail("business_id obrigatório");
  const email = String(p.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("E-mail inválido");

  const { data: biz } = await db.from("businesses").select("id, owner_user_id").eq("id", p.business_id).maybeSingle();
  if (!biz) return fail("Business não encontrado", 404);
  if (biz.owner_user_id) return fail("Este business já tem um acesso vinculado");

  const { data: userId, error: rpcErr } = await db.rpc("bo_user_id_by_email", { p_email: email });
  if (rpcErr) throw new Error(rpcErr.message);
  if (!userId) return fail("Nenhuma conta encontrada com esse e-mail. Use \"Criar conta nova\".", 404);

  // Uma conta = no máximo um business (evita escopo ambíguo no RBAC).
  const { data: other } = await db.from("businesses").select("id, name").eq("owner_user_id", userId).maybeSingle();
  if (other) return fail(`Essa conta já é dona do business "${other.name}".`);

  const { error: linkErr } = await db
    .from("businesses")
    .update({ owner_user_id: userId, updated_at: new Date().toISOString() })
    .eq("id", p.business_id);
  if (linkErr) throw new Error(linkErr.message);

  await audit(db, actorId, "business.link_user", "businesses", String(p.business_id), { email, linked_user_id: userId });
  return ok({ business_id: p.business_id, user_id: userId, email, linked: true });
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

    const actorId = userData.user.id as string;

    // ── RBAC gate ──
    // admin = tudo. business/affiliate = só leitura do PRÓPRIO escopo, com os
    // filtros FORÇADOS server-side (nunca confia em business_id/affiliate_id
    // vindos do front). Quem não tem papel → 403.
    const ctx = await resolveRole(db, actorId);
    if (ctx.role === "none") return fail("Acesso restrito. Fale com o administrador.", 403);

    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const action = String(body.action ?? "");

    if (action === "me") return await actionMe(db, ctx, actorId);

    if (ctx.role !== "admin") {
      // Allowlist por papel (deny-by-default). Business gere a PRÓPRIA carteira:
      // CRUD de afiliados e de cupons dos seus afiliados. Afiliado é read-only.
      const allowed = ctx.role === "business"
        ? [
            "list_affiliates", "create_affiliate", "update_affiliate", "delete_affiliate",
            "list_coupons", "get_coupon", "create_coupon", "update_coupon", "delete_coupon",
            "check_code", "list_commissions", "list_redemptions",
            // Business só VINCULA conta que já existe. Criar login é ato de
            // ADMIN: createUser define senha e marca o e-mail como confirmado
            // sem prova de posse — um parceiro poderia "reservar" o e-mail de
            // terceiros (a vítima não conseguiria mais se cadastrar) e farmar
            // contas órfãs (criar afiliado → criar login → apagar afiliado).
            "link_affiliate_user",
          ]
        // Afiliado: leitura do próprio desempenho + a própria chave PIX.
        : ["list_commissions", "list_redemptions", "my_performance", "update_my_pix"];
      if (!allowed.includes(action)) {
        return fail("Ação não permitida para o seu perfil.", 403);
      }

      // Escopo forçado server-side. Se o escopo não resolveu, NEGA (nunca cai
      // numa consulta sem filtro). Ownership de item (update/delete) é checada
      // dentro de cada action via ctx.
      if (ctx.role === "business") {
        if (!ctx.businessId) return fail("Escopo do business não resolvido.", 403);
        delete body.__business_scope; // nunca aceita do cliente
        if (action === "list_affiliates" || action === "list_commissions" || action === "list_redemptions") {
          body.business_id = ctx.businessId;
          delete body.affiliate_id;
        }
        if (action === "list_coupons") {
          body.__business_scope = {
            businessId: ctx.businessId,
            affiliateIds: await walletAffiliateIds(db, ctx.businessId),
          };
        }
      } else {
        if (!ctx.affiliateId) return fail("Escopo do afiliado não resolvido.", 403);
        body.affiliate_id = ctx.affiliateId;
        delete body.business_id;
      }
    }

    // ── Dispatch ──
    switch (action) {
      case "create_business_user":
        return await actionCreateBusinessUser(db, body, actorId);
      case "link_business_user":
        return await actionLinkBusinessUser(db, body, actorId);
      case "create_affiliate_user":
        return await actionAffiliateUser(db, body, actorId, ctx, "create");
      case "link_affiliate_user":
        return await actionAffiliateUser(db, body, actorId, ctx, "link");
      case "overview":
        return await actionOverview(db, body);
      case "list_coupons":
        return await actionListCoupons(db, body);
      case "get_coupon":
        return await actionGetCoupon(db, body, ctx);
      case "create_coupon":
        return await actionCreateCoupon(db, body, ctx, actorId);
      case "update_coupon":
        return await actionUpdateCoupon(db, body, ctx, actorId);
      case "delete_coupon":
        return await actionDeleteCoupon(db, body, actorId, ctx);
      case "check_code":
        return await actionCheckCode(db, body);
      case "list_redemptions":
        return await actionListRedemptions(db, body, ctx);
      case "my_performance":
        return await actionMyPerformance(db, ctx);
      case "update_my_pix":
        return await actionUpdateMyPix(db, body, actorId, ctx);
      case "list_pricing":
        return await actionListPricing(db);
      case "update_price":
        return await actionUpdatePrice(db, body, actorId);
      case "update_setting":
        return await actionUpdateSetting(db, body, actorId);
      case "list_affiliates":
        return await actionListAffiliates(db, body);
      case "create_affiliate":
        return await actionCreateAffiliate(db, body, actorId, ctx);
      case "update_affiliate":
        return await actionUpdateAffiliate(db, body, actorId, ctx);
      case "delete_affiliate":
        return await actionDeleteAffiliate(db, body, actorId, ctx);
      case "list_businesses":
        return await actionListBusinesses(db, body);
      case "create_business":
        return await actionCreateBusiness(db, body, actorId);
      case "update_business":
        return await actionUpdateBusiness(db, body, actorId);
      case "list_commissions":
        return await actionListCommissions(db, body);
      case "approve_commission":
        return await actionApproveCommission(db, body, actorId);
      case "pay_commission":
        return await actionPayCommission(db, body, actorId);
      case "reverse_commission":
        return await actionReverseCommission(db, body, actorId);
      default:
        return fail(`Ação desconhecida: ${action || "(vazia)"}`);
    }
  } catch (err) {
    console.error("[bo-coupons] erro:", err);
    return fail(err instanceof Error ? err.message : "Erro interno", 500);
  }
});
