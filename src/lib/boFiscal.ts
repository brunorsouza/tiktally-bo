import { createGateway, PREVIEW_MODE } from "./gateway";
import { mockBoFiscal } from "./mockBoFiscal";
import type {
  InvoiceMetrics,
  PaginatedInvoices,
  InvoiceDetail,
  InvoiceFilters,
  BoInvoice,
  BoSeller,
  SpedyWebhook,
  SpedyCompanyList,
  SpedyCompanySettings,
  SpedyCertificate,
  SpedyCompanyLinkResult,
  DeleteCompanyResult,
  BoAccount,
  BoPlan,
  SetAccountPlanResult,
  NewAccountInput,
  CreateAccountResult,
  SpedyEnvironmentsMap,
  SetAccountEnvironmentResult,
  SpedyEnvironmentType,
} from "@/types";

export { PREVIEW_MODE };

const FN = import.meta.env.VITE_BO_FISCAL_FN || "bo-fiscal";

/**
 * Chama a edge function gateway `bo-fiscal`. O JWT do admin logado vai no
 * Authorization, e a function valida profiles.is_admin antes de executar.
 * VITE_BO_FISCAL_URL aponta pra function local (`supabase functions serve`).
 */
const call = createGateway(FN, import.meta.env.VITE_BO_FISCAL_URL);

const realBoFiscal = {
  metrics: () => call<InvoiceMetrics>("metrics"),

  listInvoices: (filters: InvoiceFilters = {}) =>
    call<PaginatedInvoices>("list_invoices", {
      status: filters.status,
      search: filters.search,
      user_id: filters.userId,
      page: filters.page ?? 1,
      page_size: filters.pageSize ?? 25,
    }),

  getInvoice: (id: string) => call<InvoiceDetail>("get_invoice", { id }),

  listSellers: () => call<BoSeller[]>("list_sellers"),

  checkStatus: (id: string) => call<BoInvoice>("check_status", { id }),

  reprocess: (id: string) => call<BoInvoice>("reprocess", { id }),

  /**
   * Cancela uma NF-e autorizada. `reason` é a justificativa que vai pro evento
   * de cancelamento na SEFAZ (15 a 255 caracteres, regra do campo `xJust`).
   */
  cancelInvoice: (id: string, reason: string) =>
    call<BoInvoice & { spedy_status: string | null }>("cancel_invoice", { id, reason }),

  resendEmail: (id: string) => call<{ ok: boolean }>("resend_email", { id }),

  getDocumentUrls: (id: string) =>
    call<{ pdf_url: string | null; xml_url: string | null }>("get_document", { id }),

  listWebhooks: () => call<SpedyWebhook[]>("list_webhooks"),

  setWebhook: (id: string, enabled: boolean) =>
    call<{ ok: boolean }>("set_webhook", { id, enabled }),

  /* ── Empresas na Spedy ──────────────────────────────────────────────────
     `sandbox` diz de qual CONTA estamos falando: sandbox e produção são bases
     separadas, com chaves e dados próprios. */

  /** Sem `cnpj`, lista tudo. Com, filtra — a API não tem filtro, é varredura. */
  listCompanies: (sandbox: boolean, cnpj?: string) =>
    call<SpedyCompanyList>("list_companies", { sandbox, cnpj }),

  getCompany: (companyId: string, sandbox: boolean) =>
    call<{ sandbox: boolean; company: Record<string, unknown> }>("get_company", {
      company_id: companyId,
      sandbox,
    }),

  getCompanySettings: (companyId: string, sandbox: boolean) =>
    call<SpedyCompanySettings>("get_company_settings", { company_id: companyId, sandbox }),

  /** Troca o ambiente da NF-e (productInvoice.environmentType). */
  setCompanyEnvironment: (
    companyId: string,
    sandbox: boolean,
    environmentType: SpedyEnvironmentType
  ) =>
    call<{ sandbox: boolean; enviado: unknown; resposta: unknown }>("set_company_settings", {
      company_id: companyId,
      sandbox,
      environment_type: environmentType,
    }),

  /**
   * Série e próxima numeração da NF-e.
   *
   * Numeração é por CNPJ + modelo + série, e a SEFAZ não esquece: número
   * pulado não volta, número repetido é rejeição 539. Por isso isto é uma
   * chamada própria, e não um campo solto junto do ambiente.
   */
  setCompanyNumbering: (
    companyId: string,
    sandbox: boolean,
    numbering: { series?: string; nextNumber?: number }
  ) =>
    call<{ sandbox: boolean; enviado: unknown; resposta: unknown }>("set_company_settings", {
      company_id: companyId,
      sandbox,
      productInvoice: {
        ...(numbering.series ? { series: numbering.series } : {}),
        ...(numbering.nextNumber ? { nextNumber: numbering.nextNumber } : {}),
      },
    }),

  listCompanyCertificates: (companyId: string, sandbox: boolean) =>
    call<{ sandbox: boolean; certificates: SpedyCertificate[] }>("list_company_certificates", {
      company_id: companyId,
      sandbox,
    }),

  /** Todas as contas, com ou sem cadastro fiscal. */
  listAccounts: () => call<BoAccount[]>("list_accounts"),

  /**
   * Cria uma conta do TikTally. Mesmo caminho do signup público (os dados vão
   * como metadata e os gatilhos populam profile e assinatura), com o e-mail já
   * confirmado — quem cadastra é o admin, que conhece o destinatário.
   */
  createAccount: (input: NewAccountInput) =>
    call<CreateAccountResult>("create_account", {
      email: input.email,
      password: input.password,
      cnpj: input.cnpj,
      legal_name: input.legalName,
      legal_cpf: input.legalCpf,
      company_name: input.companyName ?? null,
      shop_name: input.shopName ?? null,
      plan: input.plan ?? null,
      period_end: input.periodEnd ?? null,
    }),

  /** Catálogo de planos pro seletor. */
  listPlans: () => call<BoPlan[]>("list_plans"),

  /**
   * Concessão manual de plano. `plan: null` tira o acesso (assinatura volta
   * pra cancelada). Não cria nada na Asaas — não renova sozinho.
   */
  setAccountPlan: (userId: string, plan: string | null, periodEnd: string | null) =>
    call<SetAccountPlanResult>("set_account_plan", {
      user_id: userId,
      plan,
      period_end: periodEnd,
    }),

  /**
   * Define o ambiente da CONTA. Com empresa, aplica na hora; sem empresa,
   * fica guardado e o cadastro aplica quando criar.
   */
  setAccountEnvironment: (userId: string, environmentType: SpedyEnvironmentType) =>
    call<SetAccountEnvironmentResult>("set_account_environment", {
      user_id: userId,
      environment_type: environmentType,
    }),

  /** Ambiente de emissão de várias empresas numa chamada só. */
  companiesEnvironments: (companyIds: string[], sandbox: boolean) =>
    call<SpedyEnvironmentsMap>("companies_environments", {
      company_ids: companyIds,
      sandbox,
    }),

  /**
   * Apaga a empresa na Spedy. `confirmCnpj` é conferido no servidor contra o
   * CNPJ que a Spedy reporta pro id — a tela pode estar com uma lista velha.
   */
  deleteCompany: (companyId: string, sandbox: boolean, confirmCnpj: string) =>
    call<DeleteCompanyResult>("delete_company", {
      company_id: companyId,
      sandbox,
      confirm_cnpj: confirmCnpj,
    }),

  /** Reconcilia o spedy_company_id do seller com a empresa que existe na Spedy. */
  linkCompany: (userId: string, opts: { sandbox?: boolean; cnpj?: string; dryRun?: boolean } = {}) =>
    call<SpedyCompanyLinkResult>("link_company", {
      user_id: userId,
      sandbox: opts.sandbox,
      cnpj: opts.cnpj,
      dry_run: opts.dryRun,
    }),
};

export const boFiscal = PREVIEW_MODE ? mockBoFiscal : realBoFiscal;
