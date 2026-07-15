/**
 * Mock do gateway bo-coupons para o MODO PREVIEW de dev (VITE_DEV_PREVIEW=true).
 * Espelha a tabela `coupons` REAL (desconto/trial). Estado em memória p/ as
 * mutações refletirem. NUNCA usado em produção.
 */
import type {
  CodeCheck,
  Coupon,
  CouponDetail,
  CouponFilters,
  CouponInput,
  CouponsOverview,
  CouponRedemption,
  PaginatedCoupons,
  PaginatedRedemptions,
  RedemptionFilters,
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

const coupons: Coupon[] = [
  {
    id: "cpn_1",
    code: "TESTE7",
    description: "7 dias grátis (onboarding)",
    discount_kind: "TRIAL_DAYS",
    discount: 7,
    status: "ACTIVE",
    max_redeems: -1,
    redeems_count: 34,
    valid_from: iso(120),
    valid_until: null,
    applicable_plans: ["pro"],
    applicable_cycles: null,
    metadata: {},
    created_at: iso(120),
    updated_at: iso(2),
  },
  {
    id: "cpn_2",
    code: "BLACK30",
    description: "30% off Black Friday",
    discount_kind: "PERCENTAGE",
    discount: 30,
    status: "ACTIVE",
    max_redeems: 200,
    redeems_count: 47,
    valid_from: iso(20),
    valid_until: iso(-10),
    applicable_plans: ["pro", "erp"],
    applicable_cycles: ["semiannually", "yearly"],
    metadata: {},
    created_at: iso(20),
    updated_at: iso(3),
  },
  {
    id: "cpn_3",
    code: "PARCEIRO150",
    description: "R$150 off (parceria)",
    discount_kind: "FIXED",
    discount: 15000,
    status: "INACTIVE",
    max_redeems: 50,
    redeems_count: 50,
    valid_from: iso(60),
    valid_until: null,
    applicable_plans: ["erp"],
    applicable_cycles: ["yearly"],
    metadata: {},
    created_at: iso(60),
    updated_at: iso(5),
  },
];

const isExhausted = (c: Coupon) => c.max_redeems >= 0 && c.redeems_count >= c.max_redeems;
const decorate = (c: Coupon): Coupon => ({ ...c, exhausted: isExhausted(c) });

const redemptions: CouponRedemption[] = Array.from({ length: 24 }, (_, i) => {
  const coupon = coupons[i % 2]; // TESTE7 / BLACK30
  const trial = coupon.discount_kind === "TRIAL_DAYS";
  return {
    id: nextId("red"),
    coupon_id: coupon.id,
    user_id: `user_${i}`,
    billing_id: trial ? null : `bil_${i}`,
    subscription_id: `sub_${i}`,
    discount_cents: trial ? 0 : 53820,
    redeemed_at: iso(i),
    coupon_code: coupon.code,
    coupon_kind: coupon.discount_kind,
    user_email: `us***@gmail.com`,
  };
});

function buildOverview(period = 30): CouponsOverview {
  const since = Date.now() - period * 864e5;
  const inPeriod = redemptions.filter((r) => new Date(r.redeemed_at ?? "").getTime() >= since);
  const by_day = Array.from({ length: 14 }, (_, i) => ({
    day: iso(13 - i).slice(0, 10),
    redemptions: 1 + ((i * 2) % 4),
  }));
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

export const mockBoCoupons = {
  overview: (period?: number) => delay(buildOverview(period ?? 30)),

  listCoupons: (f: CouponFilters = {}): Promise<PaginatedCoupons> => {
    let items = coupons.map(decorate);
    if (f.status) items = items.filter((c) => c.status === f.status);
    if (f.discountKind) items = items.filter((c) => c.discount_kind === f.discountKind);
    if (f.search) {
      const t = f.search.toLowerCase();
      items = items.filter(
        (c) => c.code.toLowerCase().includes(t) || (c.description ?? "").toLowerCase().includes(t)
      );
    }
    const pageSize = f.pageSize ?? 25;
    const page = f.page ?? 1;
    return delay({ items, total: items.length, page, pageSize, totalPages: Math.max(1, Math.ceil(items.length / pageSize)) });
  },

  getCoupon: (id: string): Promise<CouponDetail> => {
    const coupon = decorate(coupons.find((c) => c.id === id) ?? coupons[0]);
    return delay({ coupon, redemptions: redemptions.filter((r) => r.coupon_id === coupon.id) });
  },

  createCoupon: (input: CouponInput): Promise<Coupon> => {
    const coupon: Coupon = {
      id: nextId("cpn"),
      code: input.code.toUpperCase(),
      description: input.description ?? null,
      discount_kind: input.discount_kind,
      discount: input.discount,
      status: input.status ?? "ACTIVE",
      max_redeems: input.max_redeems ?? -1,
      redeems_count: 0,
      valid_from: input.valid_from ?? iso(0),
      valid_until: input.valid_until ?? null,
      applicable_plans: input.applicable_plans ?? null,
      applicable_cycles: input.applicable_cycles ?? null,
      metadata: {},
      created_at: iso(0),
      updated_at: iso(0),
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
    if (!/^[A-Z0-9]{3,32}$/.test(norm))
      return delay({ code: norm, available: false, reason: "Use 3–32 letras/números" });
    const exists = coupons.some((c) => c.code.toUpperCase() === norm && c.id !== excludeId);
    return delay({ code: norm, available: !exists, reason: exists ? "Código já em uso" : null });
  },

  listRedemptions: (f: RedemptionFilters = {}): Promise<PaginatedRedemptions> => {
    let items = [...redemptions];
    if (f.couponId) items = items.filter((r) => r.coupon_id === f.couponId);
    if (f.onlyTrial) items = items.filter((r) => r.billing_id == null);
    if (f.onlyDiscount) items = items.filter((r) => r.billing_id != null);
    const pageSize = f.pageSize ?? 50;
    const page = f.page ?? 1;
    const start = (page - 1) * pageSize;
    return delay({
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    });
  },
};
