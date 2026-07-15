import { createGateway, PREVIEW_MODE } from "./gateway";
import { mockBoCoupons } from "./mockBoCoupons";
import type {
  CodeCheck,
  Coupon,
  CouponDetail,
  CouponFilters,
  CouponInput,
  CouponsOverview,
  PaginatedCoupons,
  PaginatedRedemptions,
  RedemptionFilters,
} from "@/types";

const FN = import.meta.env.VITE_BO_COUPONS_FN || "bo-coupons";

/**
 * Chama a edge function gateway `bo-coupons` (mesma segurança do bo-fiscal:
 * JWT do admin + validação de profiles.is_admin server-side). Opera a tabela
 * `coupons` REAL do TikTally. VITE_BO_COUPONS_URL aponta pra function local.
 */
const call = createGateway(FN, import.meta.env.VITE_BO_COUPONS_URL);

const realBoCoupons = {
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
};

export const boCoupons = PREVIEW_MODE ? mockBoCoupons : realBoCoupons;
