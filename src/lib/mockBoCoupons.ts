/**
 * Mock do gateway bo-coupons para o MODO PREVIEW de dev (VITE_DEV_PREVIEW=true).
 * Espelha as tabelas reais (cupons/afiliados/businesses/comissões/preços).
 * Estado em memória p/ as mutações refletirem. NUNCA usado em produção.
 */
import type {
  Affiliate,
  AffiliateFilters,
  AffiliateInput,
  AffiliateUserInput,
  Business,
  BusinessInput,
  BusinessUserInput,
  CodeCheck,
  Commission,
  CommissionFilters,
  Coupon,
  CouponDetail,
  CouponFilters,
  CouponInput,
  CouponsOverview,
  CouponRedemption,
  DeleteResult,
  MeInfo,
  MyPerformance,
  PaginatedAffiliates,
  PaginatedCommissions,
  PaginatedCoupons,
  PaginatedRedemptions,
  Plan,
  Price,
  PricingData,
  TestPlanState,
  RedemptionFilters,
  Setting,
} from "@/types";

const delay = <T>(value: T, ms = 200): Promise<T> =>
  new Promise((r) => setTimeout(() => r(value), ms));

function iso(daysAgo: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 12, 0, 0);
  return d.toISOString();
}

let seq = 100;
const nextId = (p: string) => `${p}_${++seq}`;

// ── Businesses / Afiliados ──────────────────────────────────────────────────
const businesses: Business[] = [
  { id: "biz_1", owner_user_id: null, name: "Agência Alfa", email: "contato@alfa.com", status: "active", notes: null, created_at: iso(40), updated_at: iso(2), affiliates_count: 2 },
  { id: "biz_2", owner_user_id: null, name: "Parceiro Beta", email: "beta@parceiro.com", status: "active", notes: null, created_at: iso(25), updated_at: iso(1), affiliates_count: 1 },
];

const affiliates: Affiliate[] = [
  { id: "aff_1", user_id: null, business_id: "biz_1", name: "João Silva", email: "joao@alfa.com", pix_key: "joao@alfa.com", status: "active", default_commission_type: "percent", default_commission_value: 10, created_at: iso(38), updated_at: iso(2), business_name: "Agência Alfa" },
  { id: "aff_2", user_id: null, business_id: "biz_1", name: "Maria Souza", email: "maria@alfa.com", pix_key: "11999998888", status: "active", default_commission_type: "fixed", default_commission_value: 5000, created_at: iso(30), updated_at: iso(3), business_name: "Agência Alfa" },
  { id: "aff_3", user_id: null, business_id: null, name: "Afiliado Casa", email: "casa@tiktally.com.br", pix_key: null, status: "active", default_commission_type: "percent", default_commission_value: 15, created_at: iso(50), updated_at: iso(5), business_name: null },
];

// ── Cupons ──────────────────────────────────────────────────────────────────
const coupons: Coupon[] = [
  {
    id: "cpn_1", code: "TESTE7", description: "7 dias grátis (onboarding)",
    discount_kind: "TRIAL_DAYS", discount: 7, status: "ACTIVE", max_redeems: -1, redeems_count: 34,
    valid_from: iso(120), valid_until: null, applicable_plans: ["pro"], applicable_cycles: null,
    affiliate_id: null, applies_to_renewals: true, metadata: {}, created_at: iso(120), updated_at: iso(2),
  },
  {
    id: "cpn_2", code: "JOAO20", description: "Cupom afiliado João (-20%)",
    discount_kind: "PERCENTAGE", discount: 20, status: "ACTIVE", max_redeems: -1, redeems_count: 47,
    valid_from: iso(20), valid_until: null, applicable_plans: ["pro", "erp"], applicable_cycles: ["semiannually", "yearly"],
    affiliate_id: "aff_1", applies_to_renewals: true, metadata: {}, created_at: iso(20), updated_at: iso(3),
  },
  {
    id: "cpn_3", code: "PARCEIRO150", description: "R$150 off (parceria)",
    discount_kind: "FIXED", discount: 15000, status: "INACTIVE", max_redeems: 50, redeems_count: 50,
    valid_from: iso(60), valid_until: null, applicable_plans: ["erp"], applicable_cycles: ["yearly"],
    affiliate_id: "aff_3", applies_to_renewals: true, metadata: {}, created_at: iso(60), updated_at: iso(5),
  },
];

const isExhausted = (c: Coupon) => c.max_redeems >= 0 && c.redeems_count >= c.max_redeems;
const decorate = (c: Coupon): Coupon => ({ ...c, exhausted: isExhausted(c) });

const redemptions: CouponRedemption[] = Array.from({ length: 24 }, (_, i) => {
  const coupon = coupons[i % 2]; // TESTE7 / JOAO20
  const trial = coupon.discount_kind === "TRIAL_DAYS";
  return {
    id: nextId("red"), coupon_id: coupon.id, user_id: `user_${i}`,
    billing_id: trial ? null : `bil_${i}`, subscription_id: `sub_${i}`,
    discount_cents: trial ? 0 : 53820, redeemed_at: iso(i),
    coupon_code: coupon.code, coupon_kind: coupon.discount_kind, user_email: `us***@gmail.com`,
  };
});

// ── Comissões ───────────────────────────────────────────────────────────────
const commissions: Commission[] = [
  { id: "com_1", redemption_id: "red_101", affiliate_id: "aff_1", business_id: "biz_1", amount_cents: 91008, commission_type: "percent", commission_value: 20, status: "pending", eligible_at: iso(-3), approved_at: null, paid_at: null, paid_by: null, payment_reference: null, notes: null, created_at: iso(2), updated_at: iso(2), affiliate_name: "João Silva", affiliate_pix_key: "joao@alfa.com", eligible: false },
  { id: "com_2", redemption_id: "red_102", affiliate_id: "aff_1", business_id: "biz_1", amount_cents: 91008, commission_type: "percent", commission_value: 20, status: "pending", eligible_at: iso(2), approved_at: null, paid_at: null, paid_by: null, payment_reference: null, notes: null, created_at: iso(10), updated_at: iso(10), affiliate_name: "João Silva", affiliate_pix_key: "joao@alfa.com", eligible: true },
  { id: "com_3", redemption_id: "red_103", affiliate_id: "aff_3", business_id: null, amount_cents: 5000, commission_type: "fixed", commission_value: 5000, status: "approved", eligible_at: iso(15), approved_at: iso(1), paid_at: null, paid_by: null, payment_reference: null, notes: null, created_at: iso(18), updated_at: iso(1), affiliate_name: "Afiliado Casa", affiliate_pix_key: null, eligible: true },
  { id: "com_4", redemption_id: "red_104", affiliate_id: "aff_2", business_id: "biz_1", amount_cents: 5000, commission_type: "fixed", commission_value: 5000, status: "paid", eligible_at: iso(30), approved_at: iso(20), paid_at: iso(15), paid_by: "admin", payment_reference: "PIX-abc123", notes: null, created_at: iso(35), updated_at: iso(15), affiliate_name: "Maria Souza", affiliate_pix_key: "11999998888", eligible: true },
];

// ── Planos / Preços / Settings ──────────────────────────────────────────────
const plans: Plan[] = [
  { id: "pln_pro", key: "pro", name: "TikTally Pro", description: null, status: "active", sort_order: 1 },
  { id: "pln_erp", key: "erp", name: "TikTally ERP", description: null, status: "active", sort_order: 2 },
  // status 'test' = fora do /pricing público; só a allowlist alcança
  { id: "pln_test", key: "test", name: "TikTally Teste (R$10)", description: null, status: "test", sort_order: 99 },
];
const prices: Price[] = [
  { id: "prc_1", plan_id: "pln_pro", cycle: "yearly", installments: 12, installment_amount_cents: 49900, total_amount_cents: 598800, active: true },
  { id: "prc_2", plan_id: "pln_pro", cycle: "semiannually", installments: 6, installment_amount_cents: 59900, total_amount_cents: 359400, active: true },
  { id: "prc_3", plan_id: "pln_erp", cycle: "yearly", installments: 12, installment_amount_cents: 59900, total_amount_cents: 718800, active: true },
  { id: "prc_4", plan_id: "pln_erp", cycle: "semiannually", installments: 6, installment_amount_cents: 69900, total_amount_cents: 419400, active: true },
  { id: "prc_5", plan_id: "pln_test", cycle: "yearly", installments: 1, installment_amount_cents: 1000, total_amount_cents: 1000, active: true },
  { id: "prc_6", plan_id: "pln_test", cycle: "semiannually", installments: 1, installment_amount_cents: 1000, total_amount_cents: 1000, active: true },
];
const settings: Setting[] = [
  { key: "coupon_discount_percent", value: 20, description: "Desconto padrão do cupom de afiliado (%)." },
  { key: "pix_discount_percent", value: 5, description: "Desconto adicional PIX à vista (%)." },
  { key: "discount_stacking", value: "multiplicative", description: "Empilhamento cupom+PIX (×0,80×0,95)." },
  { key: "commission_hold_days", value: 7, description: "Dias de carência até a comissão ficar elegível." },
  { key: "test_plan_enabled", value: true, description: "Plano de teste de R$10 disponível para a allowlist." },
];

/** Estado das 3 camadas da trava do plano de teste (mock do preview). */
let testPlanLigado = true;

const testPlan: TestPlanState = {
  master_enabled: true,
  setting_enabled: true,
  effective: true,
  allowed_emails: ["preview@tiktally.dev"],
};

function buildOverview(period = 30): CouponsOverview {
  const since = Date.now() - period * 864e5;
  const inPeriod = redemptions.filter((r) => new Date(r.redeemed_at ?? "").getTime() >= since);
  const by_day = Array.from({ length: 14 }, (_, i) => ({ day: iso(13 - i).slice(0, 10), redemptions: 1 + ((i * 2) % 4) }));
  return {
    period_days: period,
    total_coupons: coupons.length,
    active_coupons: coupons.filter((c) => c.status === "ACTIVE").length,
    total_redemptions: redemptions.length,
    redemptions_in_period: inPeriod.length,
    discount_given_cents: redemptions.reduce((a, r) => a + r.discount_cents, 0),
    trial_redemptions: redemptions.filter((r) => r.billing_id == null).length,
    by_day,
    top_coupons: coupons
      .map((c) => ({ coupon_id: c.id, code: c.code, redeems: c.redeems_count, discount_kind: c.discount_kind }))
      .sort((a, b) => b.redeems - a.redeems),
  };
}

const paginate = <T>(items: T[], page = 1, pageSize = 50) => ({
  items: items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
  total: items.length,
  page,
  pageSize,
  totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
});

export const mockBoCoupons = {
  // Preview roda como admin (vê todas as telas).
  /**
   * Papel do preview. Escolhível por `?papel=business|affiliate|admin`, que
   * fica gravado — sem isso, o preview só mostra a interface de admin e as
   * telas de parceiro e afiliado (que têm outra navegação e outro painel
   * lateral) só apareciam com três contas reais na mão.
   */
  me: (): Promise<MeInfo> => {
    const daUrl = new URLSearchParams(location.search).get("papel");
    if (daUrl) localStorage.setItem("tiktally-bo-preview-papel", daUrl);
    const papel = (localStorage.getItem("tiktally-bo-preview-papel") ?? "admin") as MeInfo["role"];
    const ehAdmin = papel === "admin";

    return delay({
      user_id: "dev-preview",
      role: papel,
      business_id: papel === "business" ? "b1" : null,
      affiliate_id: papel === "affiliate" ? "a1" : null,
      scope_name: ehAdmin ? null : papel === "business" ? "Agência Alfa" : "João Silva",
      coupon_discount_percent: 20,
      commission_pool_percent: 30,
      coupon_percent_options: [10, 15, 20],
      own_coupon_max_percent: 10,
    });
  },

  myPerformance: (): Promise<MyPerformance> => {
    const aff = affiliates[0];
    const mine = coupons.filter((c) => c.affiliate_id === aff.id);
    const myComms = commissions.filter((c) => c.affiliate_id === aff.id);
    const sum = (pred: (c: Commission) => boolean) =>
      myComms.filter(pred).reduce((a, c) => a + c.amount_cents, 0);
    return delay({
      affiliate: { id: aff.id, name: aff.name, pix_key: aff.pix_key, status: aff.status },
      coupons: mine.map((c) => ({
        id: c.id, code: c.code, description: c.description, discount: c.discount,
        discount_kind: c.discount_kind, status: c.status, max_redeems: c.max_redeems,
        redeems_count: c.redeems_count, valid_until: c.valid_until,
        applies_to_renewals: c.applies_to_renewals, exhausted: isExhausted(c),
        share_url: `https://tiktally.com.br/plans?cupom=${c.code}`,
      })),
      performance: {
        uses: mine.reduce((a, c) => a + c.redeems_count, 0),
        active_subscriptions: 12,
        revenue_cents: 574848,
        commission_pending_cents: sum((c) => c.status === "pending" || c.status === "approved"),
        commission_paid_cents: sum((c) => c.status === "paid"),
        by_day: Array.from({ length: 14 }, (_, i) => ({ day: iso(13 - i).slice(0, 10), count: 1 + ((i * 3) % 4) })),
      },
    });
  },

  updateMyPix: (pixKey: string | null) => {
    affiliates[0].pix_key = pixKey;
    return delay({ id: affiliates[0].id, pix_key: pixKey });
  },

  createBusinessUser: (input: BusinessUserInput) =>
    delay({ business_id: input.business_id, user_id: nextId("usr"), email: input.email }),

  linkBusinessUser: (businessId: string, email: string) =>
    delay({ business_id: businessId, user_id: nextId("usr"), email, linked: true }),

  overview: (period?: number) => delay(buildOverview(period ?? 30)),

  listCoupons: (f: CouponFilters = {}): Promise<PaginatedCoupons> => {
    let items = coupons.map(decorate);
    if (f.status) items = items.filter((c) => c.status === f.status);
    if (f.discountKind) items = items.filter((c) => c.discount_kind === f.discountKind);
    if (f.search) {
      const t = f.search.toLowerCase();
      items = items.filter((c) => c.code.toLowerCase().includes(t) || (c.description ?? "").toLowerCase().includes(t));
    }
    return delay(paginate(items, f.page ?? 1, f.pageSize ?? 25));
  },

  getCoupon: (id: string): Promise<CouponDetail> => {
    const coupon = decorate(coupons.find((c) => c.id === id) ?? coupons[0]);
    return delay({ coupon, redemptions: redemptions.filter((r) => r.coupon_id === coupon.id) });
  },

  createCoupon: (input: CouponInput): Promise<Coupon> => {
    const coupon: Coupon = {
      id: nextId("cpn"), code: input.code.toUpperCase(), description: input.description ?? null,
      discount_kind: input.discount_kind, discount: input.discount, status: input.status ?? "ACTIVE",
      max_redeems: input.max_redeems ?? -1, redeems_count: 0, valid_from: input.valid_from ?? iso(0),
      valid_until: input.valid_until ?? null, applicable_plans: input.applicable_plans ?? null,
      applicable_cycles: input.applicable_cycles ?? null, affiliate_id: input.affiliate_id ?? null,
      applies_to_renewals: input.applies_to_renewals ?? true, metadata: {}, created_at: iso(0), updated_at: iso(0),
    };
    coupons.unshift(coupon);
    return delay(decorate(coupon));
  },

  updateCoupon: (id: string, input: Partial<CouponInput>): Promise<Coupon> => {
    const c = coupons.find((x) => x.id === id);
    if (c) Object.assign(c, { ...input, code: input.code ? input.code.toUpperCase() : c.code, updated_at: iso(0) });
    return delay(decorate(c ?? coupons[0]));
  },

  checkCode: (code: string, excludeId?: string): Promise<CodeCheck> => {
    const norm = code.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9]{3,32}$/.test(norm)) return delay({ code: norm, available: false, reason: "Use 3–32 letras/números" });
    const exists = coupons.some((c) => c.code.toUpperCase() === norm && c.id !== excludeId);
    return delay({ code: norm, available: !exists, reason: exists ? "Código já em uso" : null });
  },

  deleteCoupon: (id: string): Promise<DeleteResult> => {
    const i = coupons.findIndex((c) => c.id === id);
    const used = i >= 0 && coupons[i].redeems_count > 0;
    if (i >= 0) {
      if (used) coupons[i].status = "ARCHIVED";
      else coupons.splice(i, 1);
    }
    return delay({
      id,
      deleted: !used,
      archived: used,
      reason: used ? "Cupom já foi resgatado — foi arquivado em vez de excluído." : null,
    });
  },

  listRedemptions: (f: RedemptionFilters = {}): Promise<PaginatedRedemptions> => {
    let items = [...redemptions];
    if (f.couponId) items = items.filter((r) => r.coupon_id === f.couponId);
    if (f.onlyTrial) items = items.filter((r) => r.billing_id == null);
    if (f.onlyDiscount) items = items.filter((r) => r.billing_id != null);
    return delay(paginate(items, f.page ?? 1, f.pageSize ?? 50));
  },

  // ── Planos & Preços ──
  listPricing: (): Promise<PricingData> =>
    delay({ plans, prices, settings, test_plan: { ...testPlan, setting_enabled: testPlanLigado, effective: testPlanLigado } }),
  updatePrice: (id: string, input: Partial<Price>): Promise<Price> => {
    const p = prices.find((x) => x.id === id);
    if (p) Object.assign(p, input);
    return delay(p ?? prices[0]);
  },
  updateSetting: (key: string, value: unknown): Promise<Setting> => {
    const s = settings.find((x) => x.key === key);
    if (s) s.value = value;
    if (key === "test_plan_enabled") testPlanLigado = value === true;
    return delay(s ?? settings[0]);
  },

  // ── Afiliados ──
  listAffiliates: (f: AffiliateFilters = {}): Promise<PaginatedAffiliates> => {
    let items = [...affiliates];
    if (f.businessId) items = items.filter((a) => a.business_id === f.businessId);
    if (f.status) items = items.filter((a) => a.status === f.status);
    if (f.search) {
      const t = f.search.toLowerCase();
      items = items.filter((a) => a.name.toLowerCase().includes(t) || (a.email ?? "").toLowerCase().includes(t));
    }
    return delay(paginate(items, f.page ?? 1, f.pageSize ?? 50));
  },
  createAffiliate: (input: AffiliateInput): Promise<Affiliate> => {
    const a: Affiliate = {
      id: nextId("aff"), user_id: null, business_id: input.business_id ?? null, name: input.name,
      email: input.email ?? null, pix_key: input.pix_key ?? null, status: input.status ?? "active",
      default_commission_type: input.default_commission_type ?? "percent",
      default_commission_value: input.default_commission_value ?? 0, created_at: iso(0), updated_at: iso(0),
      business_name: businesses.find((b) => b.id === input.business_id)?.name ?? null,
    };
    affiliates.unshift(a);
    return delay(a);
  },
  updateAffiliate: (id: string, input: Partial<AffiliateInput>): Promise<Affiliate> => {
    const a = affiliates.find((x) => x.id === id);
    if (a) {
      Object.assign(a, { ...input, updated_at: iso(0) });
      a.business_name = businesses.find((b) => b.id === a.business_id)?.name ?? null;
    }
    return delay(a ?? affiliates[0]);
  },

  deleteAffiliate: (id: string): Promise<DeleteResult> => {
    const i = affiliates.findIndex((a) => a.id === id);
    const hasHistory = commissions.some((c) => c.affiliate_id === id);
    if (i >= 0) {
      if (hasHistory) affiliates[i].status = "suspended";
      else affiliates.splice(i, 1);
    }
    return delay({
      id,
      deleted: !hasHistory,
      suspended: hasHistory,
      reason: hasHistory ? "Afiliado tem histórico — foi suspenso em vez de excluído." : null,
    });
  },

  createAffiliateUser: (input: AffiliateUserInput) => {
    const a = affiliates.find((x) => x.id === input.affiliate_id);
    const uid = nextId("usr");
    if (a) a.user_id = uid;
    return delay({ affiliate_id: input.affiliate_id, user_id: uid, email: input.email });
  },

  linkAffiliateUser: (affiliateId: string, email: string) => {
    const a = affiliates.find((x) => x.id === affiliateId);
    const uid = nextId("usr");
    if (a) a.user_id = uid;
    return delay({ affiliate_id: affiliateId, user_id: uid, email });
  },

  // ── Businesses ──
  listBusinesses: (search?: string): Promise<{ items: Business[] }> => {
    let items = [...businesses];
    if (search) {
      const t = search.toLowerCase();
      items = items.filter((b) => b.name.toLowerCase().includes(t) || (b.email ?? "").toLowerCase().includes(t));
    }
    return delay({ items });
  },
  createBusiness: (input: BusinessInput): Promise<Business> => {
    const b: Business = {
      id: nextId("biz"), owner_user_id: null, name: input.name, email: input.email ?? null,
      status: input.status ?? "active", notes: input.notes ?? null, created_at: iso(0), updated_at: iso(0), affiliates_count: 0,
    };
    businesses.unshift(b);
    return delay(b);
  },
  updateBusiness: (id: string, input: Partial<BusinessInput>): Promise<Business> => {
    const b = businesses.find((x) => x.id === id);
    if (b) Object.assign(b, { ...input, updated_at: iso(0) });
    return delay(b ?? businesses[0]);
  },

  // ── Comissões ──
  listCommissions: (f: CommissionFilters = {}): Promise<PaginatedCommissions> => {
    let items = [...commissions];
    if (f.status === "eligible") items = items.filter((c) => c.status === "pending" && c.eligible);
    else if (f.status) items = items.filter((c) => c.status === f.status);
    if (f.affiliateId) items = items.filter((c) => c.affiliate_id === f.affiliateId);
    if (f.businessId) items = items.filter((c) => c.business_id === f.businessId);
    return delay(paginate(items, f.page ?? 1, f.pageSize ?? 50));
  },
  approveCommission: (id: string): Promise<Commission> => {
    const c = commissions.find((x) => x.id === id);
    if (c) { c.status = "approved"; c.approved_at = iso(0); }
    return delay(c ?? commissions[0]);
  },
  payCommission: (id: string, paymentReference?: string): Promise<Commission> => {
    const c = commissions.find((x) => x.id === id);
    if (c) { c.status = "paid"; c.paid_at = iso(0); c.payment_reference = paymentReference ?? null; }
    return delay(c ?? commissions[0]);
  },
  reverseCommission: (id: string, reason: string): Promise<Commission> => {
    const c = commissions.find((x) => x.id === id);
    if (c) { c.status = "reversed"; c.notes = reason; }
    return delay(c ?? commissions[0]);
  },
};
