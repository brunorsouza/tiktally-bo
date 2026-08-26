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
  /** Justificativa enviada à SEFAZ no cancelamento (15 a 255 caracteres). */
  cancel_reason?: string | null;
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
  /** Derivado pelo gateway: valid_until já passou. O `status` segue ACTIVE. */
  expired?: boolean;
  /** Derivado pelo gateway: valid_from ainda no futuro. */
  scheduled?: boolean;
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
  /** Descontos que o business pode escolher (ex.: [5, 10, 15]). */
  coupon_percent_options: number[];
  /** Teto do cupom da própria conta do business (sem afiliado). */
  own_coupon_max_percent: number;
}

export interface BusinessUserInput {
  business_id: string;
  email: string;
  password: string;
}

/** Acesso do afiliado: senha só no modo "criar conta nova". */
export interface AffiliateUserInput {
  affiliate_id: string;
  email: string;
  password?: string;
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
  expired?: boolean;
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

/**
 * Estado das três camadas da trava do plano de teste (R$10).
 * Só `setting_enabled` é editável por aqui — as outras duas vêm de secrets do
 * Supabase, de propósito (ver supabase/functions/_shared/billing/test-plan.ts
 * no repo do app).
 */
export interface TestPlanState {
  /** Freio de emergência (secret TEST_PLAN_ENABLED). Read-only. */
  master_enabled: boolean;
  /** Toggle desta tela (settings.test_plan_enabled). */
  setting_enabled: boolean;
  /** Resultado das três camadas juntas. */
  effective: boolean;
  /** Quem pode usar (secret TEST_PLAN_ALLOWED_EMAILS). Read-only. */
  allowed_emails: string[];
}

export interface PricingData {
  plans: Plan[];
  prices: Price[];
  settings: Setting[];
  /** Ausente em gateways antigos — tratar como indisponível. */
  test_plan?: TestPlanState;
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

/* ── Empresas na Spedy ────────────────────────────────────────────────────
   Escopo de CONTA: quem gerencia empresa é a chave da empresa titular. E
   sandbox e produção são contas SEPARADAS — a mesma empresa não existe nas
   duas, por isso todo retorno carrega de qual base ele veio. */

export interface SpedyCompany {
  id: string | null;
  name: string | null;
  legalName: string | null;
  /** CNPJ sem máscara, como a Spedy devolve. */
  federalTaxNumber: string | null;
  email: string | null;
  phone: string | null;
  mobilePhone: string | null;
  address: Record<string, unknown> | null;
}

export interface SpedyCompanyList {
  sandbox: boolean;
  /** Total varrido na conta, antes do filtro por CNPJ. */
  total: number;
  companies: SpedyCompany[];
}

/** production = SEFAZ real. development = homologação. simulation = simulada. */
export type SpedyEnvironmentType = "production" | "development" | "simulation";

export interface SpedyCompanySettings {
  sandbox: boolean;
  general: {
    allowDuplicateFederalTaxNumbers: boolean | null;
    allowNaturalPersonCompany: boolean | null;
    allowMultipleInvoiceModelsPerOrder: boolean | null;
    decimalPrecision: number | null;
    taxReformFieldsEnabled: boolean | null;
    technicalResponsible: Record<string, unknown> | null;
  };
  productInvoice: {
    series: string | null;
    environmentType: SpedyEnvironmentType | null;
    nextNumber: number | null;
    danfePrintLayout: string | null;
    inbound: Record<string, unknown> | null;
  };
  consumerInvoice: {
    series: string | null;
    environmentType: SpedyEnvironmentType | null;
    nextNumber: number | null;
    tokenId: string | null;
    csc: string | null;
    allowOfflineContingency: boolean | null;
  };
  serviceInvoice: {
    series: string | null;
    environmentType: SpedyEnvironmentType | null;
    issueType: string | null;
    userName: string | null;
    password: string | null;
    nextBatchNumber: number | null;
    authNumber: string | null;
    nextNumber: number | null;
    sendCityTaxNumber: string | null;
  };
}

export interface SpedyCertificate {
  id: string | null;
  isActive: boolean | null;
  expirationAt: string | null;
  [k: string]: unknown;
}

export interface SpedyCompanyLinkResult {
  linked: boolean;
  sandbox: boolean;
  reason?: "not_found" | "ambiguous" | "dry_run";
  cnpj?: string;
  company?: SpedyCompany;
  companies?: SpedyCompany[];
  aviso?: string;
}

export interface DeleteCompanyResult {
  deleted: boolean;
  sandbox: boolean;
  company_id: string;
  /** Já não existia na Spedy: o vínculo local foi limpo mesmo assim. */
  alreadyGone: boolean;
  /** Sellers cujo cadastro fiscal voltou ao estado inicial. */
  sellers_limpos: string[];
}

/** Uma conta do sistema com o estado fiscal dela. Ver `list_accounts`. */
export interface BoAccount {
  user_id: string;
  email: string | null;
  created_at: string | null;
  shop_name: string | null;
  plan: string | null;
  status: string | null;
  spedy_enabled: boolean | null;
  /** Escolha do painel. null = ninguém escolheu (empresa nasce em produção). */
  spedy_environment: SpedyEnvironmentType | null;
  cnpj: string | null;
  razao_social: string | null;
  spedy_company_id: string | null;
  spedy_active: boolean | null;
  spedy_use_sandbox: boolean;
  emission_mode: string | null;
  certificate_expires_at: string | null;
  /** Fim do período pago/concedido — a "próxima renovação". */
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /** Assinatura dirigida pela Asaas (recorrência ou cartão salvo). */
  gateway_managed: boolean;
}

/** Plano do catálogo (`plans`), filtrado pelo que a CHECK do banco aceita. */
export interface BoPlan {
  key: string;
  name: string;
  description: string | null;
  status: string | null;
  sort_order: number | null;
}

export interface SetAccountPlanResult {
  user_id: string;
  /** `null` = ficou sem plano (assinatura cancelada). */
  plan: string | null;
  status: string;
  current_period_end: string | null;
  gateway_managed: boolean;
}

/** Cadastro de uma conta do TikTally pelo backoffice. */
export interface NewAccountInput {
  email: string;
  password: string;
  /** Só dígitos ou com máscara — o servidor normaliza e confere o dígito. */
  cnpj: string;
  legalName: string;
  legalCpf: string;
  companyName?: string | null;
  shopName?: string | null;
  /** `null` = entra sem plano (paywall de pé). */
  plan?: string | null;
  /** Até quando o acesso vale. Obrigatório quando há plano. */
  periodEnd?: string | null;
}

export interface CreateAccountResult {
  user_id: string;
  email: string;
  /** Outra conta já usa esse CNPJ. Não impede o cadastro, mas o admin precisa saber. */
  cnpj_duplicado: boolean;
  /** `false` = o gatilho não gravou o cadastro fiscal; a conta entrou sem CNPJ. */
  perfil_gravado: boolean;
  plan: string | null;
  /** Sem plano escolhido nasce `cancelled` — o paywall segue de pé. */
  subscription_status: string | null;
  current_period_end: string | null;
}

/** Ambiente lido por empresa. `erro` distingue "não consegui ler" de "não tem". */
export interface SpedyEnvironmentEntry {
  environmentType: SpedyEnvironmentType | null;
  series?: string | null;
  erro: string | null;
}

export interface SpedyEnvironmentsMap {
  sandbox: boolean;
  environments: Record<string, SpedyEnvironmentEntry>;
}

/** Resultado de definir o ambiente de uma conta. Ver `set_account_environment`. */
export interface SetAccountEnvironmentResult {
  saved: boolean;
  /** false quando não há empresa ainda, ou quando a Spedy recusou. */
  applied: boolean;
  reason?: "sem_empresa" | "spedy_recusou";
  erro?: string;
  environment: SpedyEnvironmentType;
  company_id?: string;
}

// ── Administradores do backoffice ──────────────────────────────────────────

/**
 * Quem tem acesso ao backoffice. "Ser admin" é a coluna `profiles.is_admin` —
 * é dela que sai toda a proteção do console.
 */
export interface BoAdmin {
  user_id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  shop_name: string | null;
  /** Conta que também é seller do TikTally — revogar aqui não a apaga. */
  tambem_seller: boolean;
  /** A conta de quem está olhando. Ninguém revoga o próprio acesso. */
  eu_mesmo: boolean;
}

export interface GrantAdminInput {
  email: string;
  /** `link` promove uma conta existente; `create` cria o login e promove. */
  mode: "link" | "create";
  /** Só em `create`. */
  password?: string;
}

export interface GrantAdminResult {
  user_id: string;
  email: string;
  mode: "link" | "create";
  tambem_seller: boolean;
}
