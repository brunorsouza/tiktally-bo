import { createGateway, PREVIEW_MODE } from "./gateway";
import { mockBoCoupons } from "./mockBoCoupons";
import type {
  Affiliate,
  AffiliateFilters,
  AffiliateInput,
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
  DeleteResult,
  MyPerformance,
  PaginatedAffiliates,
  PaginatedCommissions,
  PaginatedCoupons,
  MeInfo,
  PaginatedRedemptions,
  Price,
  PricingData,
  RedemptionFilters,
  Setting,
} from "@/types";

const FN = import.meta.env.VITE_BO_COUPONS_FN || "bo-coupons";

/**
 * Chama a edge function gateway `bo-coupons` (mesma segurança do bo-fiscal:
 * JWT do admin + validação de profiles.is_admin server-side). Opera a tabela
 * `coupons` REAL do TikTally. VITE_BO_COUPONS_URL aponta pra function local.
 */
const call = createGateway(FN, import.meta.env.VITE_BO_COUPONS_URL);

const realBoCoupons = {
  /** Papel + escopo do usuário logado (fonte da verdade: server-side). */
  me: () => call<MeInfo>("me"),

  /** Painel do afiliado: cupons + desempenho + link de divulgação. */
  myPerformance: () => call<MyPerformance>("my_performance"),

  /** Afiliado atualiza a própria chave PIX. */
  updateMyPix: (pixKey: string | null) => call<{ id: string; pix_key: string | null }>("update_my_pix", { pix_key: pixKey }),

  createBusinessUser: (input: BusinessUserInput) =>
    call<{ business_id: string; user_id: string; email: string }>("create_business_user", { ...input }),

  /** Vincula uma conta que JÁ existe (ex.: login do TikTally Seller) ao business. */
  linkBusinessUser: (businessId: string, email: string) =>
    call<{ business_id: string; user_id: string; email: string; linked: boolean }>("link_business_user", {
      business_id: businessId,
      email,
    }),

  overview: (period?: number) => call<CouponsOverview>("overview", { period }),

  listCoupons: (f: CouponFilters = {}) =>
    call<PaginatedCoupons>("list_coupons", {
      status: f.status,
      discount_kind: f.discountKind,
      search: f.search,
      page: f.page ?? 1,
      page_size: f.pageSize ?? 25,
    }),

  getCoupon: (id: string) => call<CouponDetail>("get_coupon", { id }),

  createCoupon: (input: CouponInput) => call<Coupon>("create_coupon", { ...input }),

  updateCoupon: (id: string, input: Partial<CouponInput>) =>
    call<Coupon>("update_coupon", { id, ...input }),

  checkCode: (code: string, excludeId?: string) =>
    call<CodeCheck>("check_code", { code, exclude_id: excludeId }),

  /** Apaga o cupom; se já teve resgate, o servidor arquiva (soft delete). */
  deleteCoupon: (id: string) => call<DeleteResult>("delete_coupon", { id }),

  listRedemptions: (f: RedemptionFilters = {}) =>
    call<PaginatedRedemptions>("list_redemptions", {
      coupon_id: f.couponId,
      only_trial: f.onlyTrial,
      only_discount: f.onlyDiscount,
      from: f.from,
      to: f.to,
      page: f.page ?? 1,
      page_size: f.pageSize ?? 50,
    }),

  // ── Planos & Preços ──
  listPricing: () => call<PricingData>("list_pricing"),
  updatePrice: (
    id: string,
    input: Partial<Pick<Price, "installment_amount_cents" | "total_amount_cents" | "installments">>
  ) => call<Price>("update_price", { id, ...input }),
  updateSetting: (key: string, value: unknown) => call<Setting>("update_setting", { key, value }),

  // ── Afiliados ──
  listAffiliates: (f: AffiliateFilters = {}) =>
    call<PaginatedAffiliates>("list_affiliates", {
      business_id: f.businessId,
      status: f.status,
      search: f.search,
      page: f.page ?? 1,
      page_size: f.pageSize ?? 50,
    }),
  createAffiliate: (input: AffiliateInput) => call<Affiliate>("create_affiliate", { ...input }),
  updateAffiliate: (id: string, input: Partial<AffiliateInput>) =>
    call<Affiliate>("update_affiliate", { id, ...input }),

  /** Apaga o afiliado; se tiver histórico, o servidor suspende (soft delete). */
  deleteAffiliate: (id: string) => call<DeleteResult>("delete_affiliate", { id }),

  // ── Businesses ──
  listBusinesses: (search?: string) => call<{ items: Business[] }>("list_businesses", { search }),
  createBusiness: (input: BusinessInput) => call<Business>("create_business", { ...input }),
  updateBusiness: (id: string, input: Partial<BusinessInput>) =>
    call<Business>("update_business", { id, ...input }),

  // ── Comissões ──
  listCommissions: (f: CommissionFilters = {}) =>
    call<PaginatedCommissions>("list_commissions", {
      status: f.status,
      affiliate_id: f.affiliateId,
      business_id: f.businessId,
      page: f.page ?? 1,
      page_size: f.pageSize ?? 50,
    }),
  approveCommission: (id: string) => call<Commission>("approve_commission", { id }),
  payCommission: (id: string, paymentReference?: string) =>
    call<Commission>("pay_commission", { id, payment_reference: paymentReference }),
  reverseCommission: (id: string, reason: string) =>
    call<Commission>("reverse_commission", { id, reason }),
};

export const boCoupons = PREVIEW_MODE ? mockBoCoupons : realBoCoupons;
