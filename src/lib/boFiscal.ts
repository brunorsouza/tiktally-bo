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

  resendEmail: (id: string) => call<{ ok: boolean }>("resend_email", { id }),

  getDocumentUrls: (id: string) =>
    call<{ pdf_url: string | null; xml_url: string | null }>("get_document", { id }),

  listWebhooks: () => call<SpedyWebhook[]>("list_webhooks"),

  setWebhook: (id: string, enabled: boolean) =>
    call<{ ok: boolean }>("set_webhook", { id, enabled }),
};

export const boFiscal = PREVIEW_MODE ? mockBoFiscal : realBoFiscal;
