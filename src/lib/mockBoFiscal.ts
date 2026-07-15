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
} from "@/types";

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

  resendEmail: (_id: string) => delay({ ok: true }),

  getDocumentUrls: (_id: string) =>
    delay({ pdf_url: "https://example.com/danfe.pdf", xml_url: "https://example.com/nfe.xml" }),

  listWebhooks: (): Promise<SpedyWebhook[]> =>
    delay([
      { id: "wh_1", event: "invoice.status_changed", url: "https://api.tiktally.com.br/functions/v1/spedy-webhook-receiver", enabled: true },
      { id: "wh_2", event: "invoice.rejected", url: "https://api.tiktally.com.br/functions/v1/spedy-webhook-receiver", enabled: false },
    ]),

  setWebhook: (_id: string, _enabled: boolean) => delay({ ok: true }),
};
