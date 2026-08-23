/**
 * Mock do gateway bo-fiscal para o MODO PREVIEW de dev (VITE_DEV_PREVIEW=true).
 * Serve dados de exemplo pra navegar todas as telas sem login nem backend.
 * NUNCA é usado em produção (a flag fica desligada por padrão).
 */
import type {
  InvoiceMetrics,
  PaginatedInvoices,
  InvoiceDetail,
  InvoiceFilters,
  BoInvoice,
  BoSeller,
  SpedyWebhook,
  InvoiceStatus,
  SpedyCompany,
  SpedyCompanySettings,
  SpedyCompanyLinkResult,
  BoAccount,
  BoPlan,
  SetAccountPlanResult,
  NewAccountInput,
  CreateAccountResult,
  SpedyEnvironmentsMap,
  SetAccountEnvironmentResult,
  SpedyEnvironmentType,
  BoAdmin,
  GrantAdminInput,
  GrantAdminResult,
} from "@/types";

/** Admins do preview. Mutável de propósito: dá pra exercitar conceder e
 *  revogar na tela sem backend, inclusive as travas. */
const ADMINS: BoAdmin[] = [
  {
    user_id: "dev-preview",
    email: "preview@tiktally.dev",
    created_at: "2026-01-10T12:00:00.000Z",
    last_sign_in_at: "2026-08-23T09:40:00.000Z",
    shop_name: null,
    tambem_seller: false,
    eu_mesmo: true,
  },
  {
    user_id: "a2",
    email: "bruno@tiktally.com.br",
    created_at: "2026-02-02T12:00:00.000Z",
    last_sign_in_at: "2026-08-22T18:10:00.000Z",
    shop_name: null,
    tambem_seller: false,
    eu_mesmo: false,
  },
  {
    user_id: "a3",
    email: "loja.aurora@gmail.com",
    created_at: "2026-03-15T12:00:00.000Z",
    last_sign_in_at: null,
    shop_name: "Aurora Cosméticos",
    tambem_seller: true,
    eu_mesmo: false,
  },
];

const delay = <T>(value: T, ms = 250): Promise<T> =>
  new Promise((r) => setTimeout(() => r(value), ms));

function iso(daysAgo: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 12, 0, 0);
  return d.toISOString();
}

const SELLERS: BoSeller[] = [
  {
    user_id: "s1",
    email: "loja.aurora@gmail.com",
    shop_name: "Aurora Cosméticos",
    cnpj: "41234567000190",
    razao_social: "Aurora Comércio de Cosméticos Ltda",
    nome_fantasia: "Aurora Cosméticos",
    regime_tributario: "simples",
    spedy_active: true,
    spedy_company_id: "cmp_aurora",
    spedy_use_sandbox: false,
    emission_mode: "auto",
    certificate_expires_at: iso(-300),
    created_at: iso(120),
    counts: { pending: 0, processing: 2, authorized: 41, rejected: 1, cancelled: 2, total: 46 },
  },
  {
    user_id: "s2",
    email: "contato@techstore.com.br",
    shop_name: "TechStore BR",
    cnpj: "52987654000121",
    razao_social: "TechStore Comércio Eletrônico S/A",
    nome_fantasia: "TechStore",
    regime_tributario: "lucro_presumido",
    spedy_active: true,
    spedy_company_id: "cmp_tech",
    spedy_use_sandbox: false,
    emission_mode: "manual",
    certificate_expires_at: iso(-18),
    created_at: iso(80),
    counts: { pending: 1, processing: 0, authorized: 88, rejected: 3, cancelled: 0, total: 92 },
  },
  {
    user_id: "s3",
    email: "vendas@modafit.com",
    shop_name: "ModaFit",
    cnpj: "33111222000133",
    razao_social: "ModaFit Confecções ME",
    nome_fantasia: "ModaFit",
    regime_tributario: "simples",
    spedy_active: true,
    spedy_company_id: "cmp_moda",
    spedy_use_sandbox: true,
    emission_mode: "auto",
    certificate_expires_at: null,
    created_at: iso(20),
    counts: { pending: 0, processing: 1, authorized: 5, rejected: 0, cancelled: 0, total: 6 },
  },
  {
    user_id: "s4",
    email: "casa.viva@outlook.com",
    shop_name: "Casa Viva Decor",
    cnpj: "29555888000174",
    razao_social: "Casa Viva Decorações Ltda",
    nome_fantasia: "Casa Viva",
    regime_tributario: "simples",
    spedy_active: false,
    spedy_company_id: null,
    spedy_use_sandbox: false,
    emission_mode: "manual",
    certificate_expires_at: iso(-200),
    created_at: iso(5),
    counts: { pending: 2, processing: 0, authorized: 0, rejected: 0, cancelled: 0, total: 2 },
  },
];

const sellerRef = (s: BoSeller) => ({ user_id: s.user_id, shop_name: s.shop_name, email: s.email });

let _id = 0;
function makeInvoice(
  seller: BoSeller,
  status: InvoiceStatus,
  amount: number,
  daysAgo: number,
  extra: Partial<BoInvoice> = {}
): BoInvoice {
  _id += 1;
  const n = 1000 + _id;
  const authorized = status === "authorized";
  return {
    id: `inv_${_id}`,
    user_id: seller.user_id,
    order_id: `5790${100 + _id}`,
    tiktok_order_id: `577${900000 + _id}`,
    invoice_type: "nfe",
    status,
    emitter_cnpj: seller.cnpj,
    emitter_name: seller.razao_social,
    buyer_name: extra.buyer_name ?? "Consumidor Final",
    buyer_cpf_cnpj: extra.buyer_cpf_cnpj ?? "12345678901",
    buyer_address: { logradouro: "Rua das Flores", numero: "100", cidade: "São Paulo", uf: "SP" },
    total_amount: amount,
    tax_icms: Math.round(amount * 0.12 * 100) / 100,
    tax_pis: Math.round(amount * 0.0065 * 100) / 100,
    tax_cofins: Math.round(amount * 0.03 * 100) / 100,
    items: [
      { code: "PROD-001", description: "Produto exemplo", quantity: 1, unitAmount: amount, totalAmount: amount },
    ],
    nfe_key: authorized ? `3526${seller.cnpj}550010000${n}1000000000` : null,
    nfe_number: authorized ? String(n) : null,
    nfe_series: authorized ? "1" : null,
    spedy_order_id: `spd_${_id}`,
    spedy_invoice_id: `spi_${_id}`,
    spedy_response: {
      id: `spi_${_id}`,
      status: authorized ? "authorized" : status,
      model: "productInvoice",
      number: authorized ? n : null,
      processingDetail: {
        status: "success",
        message: authorized
          ? "Autorizado o uso da NF-e"
          : status === "rejected"
            ? extra.error_message ?? "Rejeição: NCM inválido para o produto"
            : "Em processamento",
        code: authorized ? "100" : status === "rejected" ? "E225" : null,
      },
    },
    error_message:
      status === "rejected"
        ? extra.error_message ?? "Rejeição 225: NCM informado não condiz com a descrição do produto"
        : null,
    issued_at: authorized ? iso(daysAgo) : null,
    cancelled_at: status === "cancelled" ? iso(daysAgo) : null,
    created_at: iso(daysAgo),
    updated_at: iso(daysAgo),
    sandbox: seller.spedy_use_sandbox,
    seller: sellerRef(seller),
    ...extra,
  };
}

const INVOICES: BoInvoice[] = [
  makeInvoice(SELLERS[0], "authorized", 289.9, 0, { buyer_name: "Mariana Souza" }),
  makeInvoice(SELLERS[1], "rejected", 1499.0, 0, {
    buyer_name: "Carlos Pereira",
    error_message: "Rejeição 539: duplicidade de NF-e com diferença na chave de acesso",
  }),
  makeInvoice(SELLERS[0], "processing", 79.9, 1, { buyer_name: "Ana Lima" }),
  makeInvoice(SELLERS[2], "authorized", 159.9, 1, { buyer_name: "João Castro" }),
  makeInvoice(SELLERS[1], "authorized", 3299.0, 2, { buyer_name: "Tech Distribuidora Ltda", buyer_cpf_cnpj: "11222333000181" }),
  makeInvoice(SELLERS[1], "rejected", 89.5, 2, {
    buyer_name: "Paulo Henrique",
    error_message: "Rejeição 225: falha no schema XML (campo cEAN inválido)",
  }),
  makeInvoice(SELLERS[0], "authorized", 449.0, 3, { buyer_name: "Beatriz Andrade" }),
  makeInvoice(SELLERS[3], "pending", 120.0, 0, { buyer_name: "Consumidor Final" }),
  makeInvoice(SELLERS[0], "cancelled", 199.9, 5, { buyer_name: "Rodrigo Alves" }),
  makeInvoice(SELLERS[2], "processing", 59.9, 0, { buyer_name: "Fernanda Dias" }),
];

function countBy(status: InvoiceStatus): number {
  return SELLERS.reduce((a, s) => a + s.counts[status], 0);
}

function buildMetrics(): InvoiceMetrics {
  const by_status = {
    pending: countBy("pending"),
    processing: countBy("processing"),
    authorized: countBy("authorized"),
    rejected: countBy("rejected"),
    cancelled: countBy("cancelled"),
  };
  const total = Object.values(by_status).reduce((a, b) => a + b, 0);
  const by_day = Array.from({ length: 14 }, (_, i) => {
    const day = iso(13 - i).slice(0, 10);
    const authorized = 2 + ((i * 3) % 6);
    const rejected = i % 4 === 0 ? 1 : 0;
    return { day, authorized, rejected, total: authorized + rejected };
  });
  return {
    total,
    by_status,
    rejection_rate: by_status.rejected / (by_status.authorized + by_status.rejected),
    authorized_amount: 184290.55,
    sellers_with_config: SELLERS.length,
    sellers_active: SELLERS.filter((s) => s.spedy_active).length,
    sellers_sandbox: SELLERS.filter((s) => s.spedy_use_sandbox).length,
    recent_rejections: INVOICES.filter((i) => i.status === "rejected").map((i) => ({
      id: i.id,
      user_id: i.user_id,
      shop_name: i.seller?.shop_name ?? null,
      emitter_name: i.emitter_name,
      error_message: i.error_message,
      created_at: i.created_at,
    })),
    by_day,
  };
}

export const mockBoFiscal = {
  metrics: () => delay(buildMetrics()),

  listAdmins: () => delay({ items: [...ADMINS], total: ADMINS.length }),

  grantAdmin: (input: GrantAdminInput): Promise<GrantAdminResult> => {
    const email = input.email.trim().toLowerCase();
    if (ADMINS.some((a) => a.email === email)) {
      return Promise.reject(new Error("Essa conta já é administradora."));
    }
    const novo: BoAdmin = {
      user_id: `a${Date.now()}`,
      email,
      created_at: new Date().toISOString(),
      last_sign_in_at: null,
      shop_name: null,
      tambem_seller: false,
      eu_mesmo: false,
    };
    ADMINS.push(novo);
    return delay({ user_id: novo.user_id, email, mode: input.mode, tambem_seller: false });
  },

  revokeAdmin: (userId: string) => {
    const i = ADMINS.findIndex((a) => a.user_id === userId);
    // As mesmas travas do servidor, pra o preview não mentir sobre o que a
    // tela faz de verdade.
    if (ADMINS[i]?.eu_mesmo) {
      return Promise.reject(new Error("Você não pode remover o seu próprio acesso de administrador."));
    }
    if (ADMINS.length <= 1) {
      return Promise.reject(new Error("Este é o último administrador."));
    }
    if (i >= 0) ADMINS.splice(i, 1);
    return delay({ user_id: userId });
  },

  listInvoices: (filters: InvoiceFilters = {}): Promise<PaginatedInvoices> => {
    let items = [...INVOICES];
    if (filters.status) items = items.filter((i) => i.status === filters.status);
    if (filters.userId) items = items.filter((i) => i.user_id === filters.userId);
    if (filters.search) {
      const t = filters.search.toLowerCase();
      items = items.filter((i) =>
        [i.emitter_cnpj, i.nfe_number, i.order_id, i.buyer_name, i.emitter_name]
          .join(" ")
          .toLowerCase()
          .includes(t)
      );
    }
    const pageSize = filters.pageSize ?? 25;
    const page = filters.page ?? 1;
    return delay({
      items,
      total: items.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    });
  },

  getInvoice: (id: string): Promise<InvoiceDetail> => {
    const invoice = INVOICES.find((i) => i.id === id) ?? INVOICES[0];
    const seller = SELLERS.find((s) => s.user_id === invoice.user_id) ?? null;
    return delay({ invoice, seller });
  },

  listSellers: (): Promise<BoSeller[]> => delay(SELLERS),

  checkStatus: (id: string): Promise<BoInvoice> =>
    delay(INVOICES.find((i) => i.id === id) ?? INVOICES[0]),

  reprocess: (id: string): Promise<BoInvoice> => {
    const inv = INVOICES.find((i) => i.id === id) ?? INVOICES[0];
    return delay({ ...inv, status: "processing", error_message: null });
  },

  cancelInvoice: (id: string, reason: string) => {
    const inv = INVOICES.find((i) => i.id === id) ?? INVOICES[0];
    // Fica em processing como na vida real: o 200 da Spedy é aceite, não
    // confirmação da SEFAZ.
    return delay({ ...inv, status: "processing", cancel_reason: reason, spedy_status: null });
  },

  resendEmail: (_id: string) => delay({ ok: true }),

  getDocumentUrls: (_id: string) =>
    delay({ pdf_url: "https://example.com/danfe.pdf", xml_url: "https://example.com/nfe.xml" }),

  listWebhooks: (): Promise<SpedyWebhook[]> =>
    delay([
      { id: "wh_1", event: "invoice.status_changed", url: "https://api.tiktally.com.br/functions/v1/spedy-webhook-receiver", enabled: true },
      { id: "wh_2", event: "invoice.rejected", url: "https://api.tiktally.com.br/functions/v1/spedy-webhook-receiver", enabled: false },
    ]),

  setWebhook: (_id: string, _enabled: boolean) => delay({ ok: true }),

  /* ── Empresas ─────────────────────────────────────────────────────────
     O ambiente vive num `let` de módulo pra que trocar no preview realmente
     mude o que a tela lê depois. Sem isso o botão parece quebrado. */

  listCompanies: (sandbox: boolean, cnpj?: string) => {
    const todas = MOCK_COMPANIES;
    const alvo = (cnpj ?? "").replace(/\D/g, "");
    return delay({
      sandbox,
      total: todas.length,
      companies: alvo
        ? todas.filter((c) => (c.federalTaxNumber ?? "").replace(/\D/g, "") === alvo)
        : todas,
    });
  },

  getCompany: (companyId: string, sandbox: boolean) =>
    delay({
      sandbox,
      company: MOCK_COMPANIES.find((c) => c.id === companyId) ?? MOCK_COMPANIES[0],
    }),

  getCompanySettings: (companyId: string, sandbox: boolean) =>
    delay(mockSettings(companyId, sandbox)),

  setCompanyEnvironment: (
    companyId: string,
    sandbox: boolean,
    environmentType: SpedyEnvironmentType
  ) => {
    MOCK_ENVIRONMENTS[companyId] = environmentType;
    return delay({ sandbox, enviado: { productInvoice: { environmentType } }, resposta: null });
  },

  setCompanyNumbering: (
    _companyId: string,
    sandbox: boolean,
    numbering: { series?: string; nextNumber?: number }
  ) => delay({ sandbox, enviado: { productInvoice: numbering }, resposta: { ok: true } }),

  listCompanyCertificates: (_companyId: string, sandbox: boolean) =>
    delay({
      sandbox,
      certificates: [{ id: "cert_1", isActive: true, expirationAt: "2026-12-02T00:00:00Z" }],
    }),

  setAccountEnvironment: (
    userId: string,
    environmentType: SpedyEnvironmentType
  ): Promise<SetAccountEnvironmentResult> => {
    MOCK_ACCOUNT_ENVS[userId] = environmentType;
    const conta = SELLERS.find((s) => s.user_id === userId);
    const companyId = conta?.spedy_company_id ?? null;
    if (companyId) MOCK_ENVIRONMENTS[companyId] = environmentType;
    return delay({
      saved: true,
      applied: !!companyId,
      reason: companyId ? undefined : ("sem_empresa" as const),
      environment: environmentType,
      company_id: companyId ?? undefined,
    });
  },

  listAccounts: (): Promise<BoAccount[]> =>
    delay(
      (SELLERS.map((s, i) => ({
        user_id: s.user_id,
        email: s.email,
        created_at: s.created_at,
        shop_name: s.shop_name,
        plan: i === 0 ? "erp" : "pro",
        status: "active",
        spedy_enabled: true,
        spedy_environment: MOCK_ACCOUNT_ENVS[s.user_id] ?? null,
        cnpj: s.cnpj,
        razao_social: s.razao_social,
        spedy_company_id: s.spedy_company_id,
        spedy_active: s.spedy_active,
        spedy_use_sandbox: s.spedy_use_sandbox,
        emission_mode: s.emission_mode,
        certificate_expires_at: s.certificate_expires_at,
        // Datas variadas de propósito: vencida, vencendo e longe. É o que
        // exercita os três tons da coluna de renovação.
        current_period_end: iso(i === 1 ? 2 : -(10 + i * 60)),
        cancel_at_period_end: false,
        gateway_managed: i % 2 === 0,
      })) as BoAccount[]).concat([
        // Conta SEM cadastro fiscal: é o caso que o `list_sellers` não mostra.
        {
          user_id: "s9",
          email: "loja.nova@gmail.com",
          created_at: iso(3),
          shop_name: "Loja Nova",
          // Conta sem plano: `tiktally` + cancelada é o estado de quem se
          // cadastrou e ainda não pagou.
          plan: "tiktally",
          status: "cancelled",
          spedy_enabled: true,
          spedy_environment: MOCK_ACCOUNT_ENVS["s9"] ?? null,
          cnpj: null,
          razao_social: null,
          spedy_company_id: null,
          spedy_active: null,
          spedy_use_sandbox: false,
          emission_mode: null,
          certificate_expires_at: null,
          current_period_end: null,
          cancel_at_period_end: false,
          gateway_managed: false,
        },
      ])
    ),

  /**
   * Só o caminho feliz — os erros que importam (e-mail repetido, dígito
   * inválido) são do servidor, e reproduzi-los aqui só ensinaria a tela a
   * confiar num julgamento que em produção ela não faz.
   */
  createAccount: (input: NewAccountInput): Promise<CreateAccountResult> =>
    delay({
      user_id: `novo-${input.email}`,
      email: input.email,
      cnpj_duplicado: false,
      perfil_gravado: true,
      plan: input.plan ?? "tiktally",
      subscription_status: input.plan ? "active" : "cancelled",
      current_period_end: input.plan ? input.periodEnd ?? null : null,
    }),

  listPlans: (): Promise<BoPlan[]> =>
    delay([
      { key: "pro", name: "TikTally Pro", description: null, status: "active", sort_order: 1 },
      { key: "erp", name: "TikTally ERP", description: null, status: "active", sort_order: 2 },
      { key: "test", name: "TikTally Teste (R$10)", description: null, status: "test", sort_order: 99 },
    ]),

  setAccountPlan: (
    userId: string,
    plan: string | null,
    periodEnd: string | null
  ): Promise<SetAccountPlanResult> =>
    delay({
      user_id: userId,
      plan,
      status: plan ? "active" : "cancelled",
      current_period_end: plan ? periodEnd : null,
      gateway_managed: false,
    }),

  companiesEnvironments: (companyIds: string[], sandbox: boolean): Promise<SpedyEnvironmentsMap> =>
    delay({
      sandbox,
      environments: Object.fromEntries(
        companyIds.map((id) => [
          id,
          { environmentType: MOCK_ENVIRONMENTS[id] ?? "production", series: "1", erro: null },
        ])
      ),
    }),

  deleteCompany: (companyId: string, sandbox: boolean, _confirmCnpj: string) =>
    delay({
      deleted: true,
      sandbox,
      company_id: companyId,
      alreadyGone: false,
      sellers_limpos: companyId === "cmp_aurora" ? ["s1"] : [],
    }),

  linkCompany: (
    _userId: string,
    opts: { sandbox?: boolean; cnpj?: string; dryRun?: boolean } = {}
  ): Promise<SpedyCompanyLinkResult> =>
    delay({
      linked: !opts.dryRun,
      sandbox: !!opts.sandbox,
      company: MOCK_COMPANIES[0],
    }),
};

/**
 * Uma empresa VINCULADA (o id bate com `spedy_company_id` do seller Aurora) e
 * uma ÓRFÃ. As duas precisam existir: se todo mock aparecesse sem vínculo, o
 * preview ensinaria errado justamente a coluna que a tela existe pra mostrar.
 */
const MOCK_COMPANIES: SpedyCompany[] = [
  {
    id: "cmp_aurora",
    name: "Aurora Cosméticos",
    legalName: "Aurora Comércio de Cosméticos Ltda",
    federalTaxNumber: "41234567000190",
    email: "fiscal@auroracosmeticos.com.br",
    phone: null,
    mobilePhone: null,
    address: null,
  },
  {
    id: "f37d2424-fc56-45d3-85fd-b4a60136865b",
    name: "Loja Demo",
    legalName: "Loja Demo Comercio LTDA",
    federalTaxNumber: "12345678000199",
    email: "fiscal@lojademo.com.br",
    phone: null,
    mobilePhone: null,
    address: null,
  },
];

const MOCK_ENVIRONMENTS: Record<string, SpedyEnvironmentType> = {};

/** Escolha por CONTA, que existe mesmo sem empresa. */
const MOCK_ACCOUNT_ENVS: Record<string, SpedyEnvironmentType> = {};

function mockSettings(companyId: string, sandbox: boolean): SpedyCompanySettings {
  return {
    sandbox,
    general: {
      allowDuplicateFederalTaxNumbers: false,
      allowNaturalPersonCompany: false,
      allowMultipleInvoiceModelsPerOrder: false,
      decimalPrecision: 2,
      taxReformFieldsEnabled: false,
      technicalResponsible: null,
    },
    productInvoice: {
      series: "1",
      environmentType: MOCK_ENVIRONMENTS[companyId] ?? "production",
      nextNumber: 1,
      danfePrintLayout: "default",
      inbound: null,
    },
    consumerInvoice: {
      series: null,
      environmentType: null,
      nextNumber: null,
      tokenId: null,
      csc: null,
      allowOfflineContingency: false,
    },
    serviceInvoice: {
      series: null,
      environmentType: null,
      issueType: null,
      userName: null,
      password: null,
      nextBatchNumber: null,
      authNumber: null,
      nextNumber: null,
      sendCityTaxNumber: null,
    },
  };
}
