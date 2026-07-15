/**
 * Tipos do protocolo do backoffice fiscal.
 * Espelham o shape retornado pela edge function `bo-fiscal`.
 */

export type InvoiceStatus =
  | "pending"
  | "processing"
  | "authorized"
  | "rejected"
  | "cancelled";

export interface SellerRef {
  user_id: string;
  email: string | null;
  shop_name: string | null;
}

/** Linha de invoices + dados do seller agregados pelo gateway. */
export interface BoInvoice {
  id: string;
  user_id: string;
  order_id: string;
  tiktok_order_id: string | null;
  invoice_type: string;
  status: InvoiceStatus | string | null;
  emitter_cnpj: string;
  emitter_name: string | null;
  buyer_name: string | null;
  buyer_cpf_cnpj: string | null;
  buyer_address: unknown;
  total_amount: number | null;
  tax_icms: number | null;
  tax_pis: number | null;
  tax_cofins: number | null;
  items: unknown;
  nfe_key: string | null;
  nfe_number: string | null;
  nfe_series: string | null;
  spedy_order_id: string | null;
  spedy_invoice_id: string | null;
  spedy_response: unknown;
  error_message: string | null;
  issued_at: string | null;
  cancelled_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  seller?: SellerRef;
  /** true se a config fiscal do seller usa sandbox Spedy. */
  sandbox?: boolean;
}

export interface InvoiceMetrics {
  total: number;
  by_status: Record<InvoiceStatus, number>;
  rejection_rate: number;
  authorized_amount: number;
  sellers_with_config: number;
  sellers_active: number;
  sellers_sandbox: number;
  recent_rejections: Array<{
    id: string;
    user_id: string;
    shop_name: string | null;
    emitter_name: string | null;
    error_message: string | null;
    created_at: string | null;
  }>;
  by_day: Array<{ day: string; authorized: number; rejected: number; total: number }>;
}

export interface BoSeller {
  user_id: string;
  email: string | null;
  shop_name: string | null;
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  regime_tributario: string | null;
  spedy_active: boolean | null;
  spedy_company_id: string | null;
  spedy_use_sandbox: boolean;
  emission_mode: string | null;
  certificate_expires_at: string | null;
  created_at: string | null;
  counts: Record<InvoiceStatus, number> & { total: number };
}

export interface SpedyWebhook {
  id: string;
  event: string;
  url: string;
  enabled?: boolean;
  isActive?: boolean;
}

export interface PaginatedInvoices {
  items: BoInvoice[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface InvoiceDetail {
  invoice: BoInvoice;
  seller: BoSeller | null;
}

export interface InvoiceFilters {
  status?: InvoiceStatus;
  search?: string;
  userId?: string;
  page?: number;
  pageSize?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Cupons — espelham a tabela `coupons` REAL do TikTally (desconto/trial),
// que o app principal já usa (billing-validate-coupon / billing-redeem-trial).
// Retornados pela edge function `bo-coupons`.
// ─────────────────────────────────────────────────────────────────────────

/** PERCENTAGE = % · FIXED = centavos · TRIAL_DAYS = dias de trial. */
export type CouponDiscountKind = "PERCENTAGE" | "FIXED" | "TRIAL_DAYS";
export type CouponStatus = "ACTIVE" | "INACTIVE" | "EXPIRED";
export type BillingPlan = "pro" | "erp";
export type BillingCycle = "semiannually" | "yearly";

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_kind: CouponDiscountKind;
  /** % (0–100) p/ PERCENTAGE · centavos p/ FIXED · dias p/ TRIAL_DAYS. */
  discount: number;
  status: CouponStatus | string;
  /** -1 (ou negativo) = ilimitado. */
  max_redeems: number;
  redeems_count: number;
  valid_from: string | null;
  valid_until: string | null;
  applicable_plans: string[] | null;
  applicable_cycles: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  /** Derivado pelo gateway: max_redeems atingido. */
  exhausted?: boolean;
}

export interface CouponRedemption {
  id: string;
  coupon_id: string;
  user_id: string;
  billing_id: string | null;
  subscription_id: string | null;
  discount_cents: number;
  redeemed_at: string | null;
  /** Enriquecido pelo gateway. */
  coupon_code?: string | null;
  coupon_kind?: CouponDiscountKind | null;
  user_email?: string | null;
}

export interface CouponsOverview {
  period_days: number;
  total_coupons: number;
  active_coupons: number;
  total_redemptions: number;
  redemptions_in_period: number;
  discount_given_cents: number;
  trial_redemptions: number;
  by_day: Array<{ day: string; redemptions: number }>;
  top_coupons: Array<{
    coupon_id: string;
    code: string;
    redeems: number;
    discount_kind: CouponDiscountKind;
  }>;
}

export interface PaginatedCoupons {
  items: Coupon[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginatedRedemptions {
  items: CouponRedemption[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CouponDetail {
  coupon: Coupon;
  redemptions: CouponRedemption[];
}

export interface CouponFilters {
  status?: CouponStatus;
  discountKind?: CouponDiscountKind;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface RedemptionFilters {
  couponId?: string;
  onlyTrial?: boolean;
  onlyDiscount?: boolean;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface CouponInput {
  code: string;
  description?: string | null;
  discount_kind: CouponDiscountKind;
  discount: number;
  status?: CouponStatus;
  max_redeems?: number;
  valid_from?: string | null;
  valid_until?: string | null;
  applicable_plans?: string[] | null;
  applicable_cycles?: string[] | null;
}

export interface CodeCheck {
  code: string;
  available: boolean;
  reason: string | null;
}
