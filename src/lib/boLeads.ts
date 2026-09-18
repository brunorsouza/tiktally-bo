import { createGateway, PREVIEW_MODE } from "./gateway";
import { mockBoLeads } from "./mockBoLeads";
import type { Lead, LeadFilters, LeadUpdateInput, LeadsOverview, PaginatedLeads } from "@/types";

const FN = import.meta.env.VITE_BO_LEADS_FN || "bo-leads";

/**
 * Chama a edge function gateway `bo-leads` (mesma segurança do bo-fiscal: JWT
 * do admin + validação de profiles.is_admin server-side). Lê a tabela
 * `pricing_leads` REAL, que a landing alimenta pelo `capture-lead`.
 * VITE_BO_LEADS_URL aponta pra function rodando local.
 */
const call = createGateway(FN, import.meta.env.VITE_BO_LEADS_URL);

const realBoLeads = {
  overview: (period?: number) => call<LeadsOverview>("overview", { period }),

  listLeads: (f: LeadFilters = {}) =>
    call<PaginatedLeads>("list_leads", {
      status: f.status || undefined,
      temperature: f.temperature || undefined,
      search: f.search || undefined,
      from: f.from || undefined,
      to: f.to || undefined,
      page: f.page ?? 1,
      page_size: f.pageSize ?? 50,
    }),

  updateLead: (id: string, input: LeadUpdateInput) => call<Lead>("update_lead", { id, ...input }),

  deleteLead: (id: string) => call<{ id: string; deleted: boolean }>("delete_lead", { id }),
};

export const boLeads = PREVIEW_MODE ? mockBoLeads : realBoLeads;
