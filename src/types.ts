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
  affiliate_id: string | null;
  applies_to_renewals: boolean;
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
  /** Mascarado (jo***@dominio) para business/afiliado; completo só p/ admin. */
  user_email?: string | null;
  /** Snapshots do momento do uso (programa de afiliados). */
  affiliate_id?: string | null;
  business_id?: string | null;
  plan_key?: string | null;
  cycle?: string | null;
  payment_method?: string | null;
  gross_amount_cents?: number | null;
  net_amount_cents?: number | null;
  status?: string | null;
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
  affiliate_id?: string | null;
  applies_to_renewals?: boolean;
}

export interface CodeCheck {
  code: string;
  available: boolean;
  reason: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Afiliados, Businesses, Comissões, Planos & Preços (Fase 5 — Admin).
// Espelham as tabelas plans/prices/settings/affiliates/businesses/commissions.
// ─────────────────────────────────────────────────────────────────────────

/** Papel do usuário logado no backoffice (resolvido server-side pelo gateway). */
export type BoRole = "admin" | "business" | "affiliate" | "none";

export interface MeInfo {
  user_id: string;
  role: BoRole;
  business_id: string | null;
  affiliate_id: string | null;
  scope_name: string | null;
  /** % padrão do cupom de afiliado. */
  coupon_discount_percent: number;
  /** Pool de gestão: comissão % = pool − desconto do cupom. */
  commission_pool_percent: number;
  /** Descontos que o business pode escolher (ex.: [10, 15, 20]). */
  coupon_percent_options: number[];
  /** Teto do cupom da própria conta do business (sem afiliado). */
  own_coupon_max_percent: number;
}

export interface BusinessUserInput {
  business_id: string;
  email: string;
  password: string;
}

/** Cupom do afiliado com o link de divulgação pronto. */
export interface MyCoupon {
  id: string;
  code: string;
  description: string | null;
  discount: number;
  discount_kind: CouponDiscountKind | string;
  status: string;
  max_redeems: number;
  redeems_count: number;
  valid_until: string | null;
  applies_to_renewals: boolean;
  exhausted?: boolean;
  share_url: string;
}

/** Painel do afiliado: cupons + desempenho consolidado. */
export interface MyPerformance {
  affiliate: { id: string; name: string; pix_key: string | null; status: string } | null;
  coupons: MyCoupon[];
  performance: {
    uses: number;
    active_subscriptions: number;
    revenue_cents: number;
    commission_pending_cents: number;
    commission_paid_cents: number;
    by_day: Array<{ day: string; count: number }>;
  };
}

/** Resultado de exclusão: o servidor pode ter feito soft delete por histórico. */
export interface DeleteResult {
  id: string;
  deleted: boolean;
  archived?: boolean;
  suspended?: boolean;
  reason: string | null;
}

export type EntityStatus = "active" | "suspended";
export type CommissionType = "fixed" | "percent";
export type CommissionStatus = "pending" | "approved" | "paid" | "cancelled" | "reversed";

export interface Plan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  sort_order: number;
}

export interface Price {
  id: string;
  plan_id: string;
  cycle: BillingCycle | string;
  installments: number;
  installment_amount_cents: number;
  total_amount_cents: number;
  active: boolean;
}

export interface Setting {
  key: string;
  value: unknown;
  description: string | null;
}

export interface PricingData {
  plans: Plan[];
  prices: Price[];
  settings: Setting[];
}

export interface Business {
  id: string;
  owner_user_id: string | null;
  name: string;
  email: string | null;
  status: EntityStatus | string;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  affiliates_count?: number;
}

export interface Affiliate {
  id: string;
  user_id: string | null;
  business_id: string | null;
  name: string;
  email: string | null;
  pix_key: string | null;
  status: EntityStatus | string;
  default_commission_type: CommissionType | string;
  default_commission_value: number;
  created_at: string | null;
  updated_at: string | null;
  business_name?: string | null;
}

export interface Commission {
  id: string;
  redemption_id: string;
  affiliate_id: string;
  business_id: string | null;
  amount_cents: number;
  commission_type: CommissionType | string;
  commission_value: number;
  status: CommissionStatus | string;
  eligible_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  paid_by: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  affiliate_name?: string | null;
  affiliate_pix_key?: string | null;
  eligible?: boolean;
}

export interface AffiliateInput {
  name: string;
  email?: string | null;
  business_id?: string | null;
  pix_key?: string | null;
  status?: EntityStatus;
  default_commission_type?: CommissionType;
  default_commission_value?: number;
}

export interface BusinessInput {
  name: string;
  email?: string | null;
  status?: EntityStatus;
  notes?: string | null;
}

export interface AffiliateFilters {
  businessId?: string;
  status?: EntityStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CommissionFilters {
  status?: "pending" | "eligible" | "approved" | "paid" | "cancelled" | "reversed";
  affiliateId?: string;
  businessId?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedAffiliates {
  items: Affiliate[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginatedCommissions {
  items: Commission[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
