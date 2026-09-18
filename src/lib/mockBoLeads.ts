/**
 * Mock do gateway bo-leads para o MODO PREVIEW de dev (VITE_DEV_PREVIEW=true).
 * Espelha `pricing_leads` com estado em memória, pra triagem e exclusão
 * refletirem na tela. NUNCA usado em produção.
 */
import type {
  Lead,
  LeadFilters,
  LeadFollowupStatus,
  LeadUpdateInput,
  LeadsOverview,
  PaginatedLeads,
} from "@/types";

const delay = <T>(value: T, ms = 200): Promise<T> =>
  new Promise((r) => setTimeout(() => r(value), ms));

const diasAtras = (d: number) => new Date(Date.now() - d * 864e5).toISOString();

let leads: Lead[] = [
  {
    id: "l1",
    name: "Camila Ferreira",
    email: "camila@lojacamila.com.br",
    whatsapp: "(11) 98877-6655",
    source: "landing_pricing",
    proceeded_at: diasAtras(1),
    proceeded_plan: "erp",
    plan_cycle: "yearly",
    referrer: "https://www.google.com/",
    created_at: diasAtras(1),
    followup_status: "new",
    followup_note: null,
    followup_at: null,
    account: null,
  },
  {
    id: "l2",
    name: "Rodrigo Alves",
    email: "rodrigo@casaeflor.com",
    whatsapp: "(21) 99123-4567",
    source: "landing_pricing",
    proceeded_at: diasAtras(3),
    proceeded_plan: "pro",
    plan_cycle: "semiannually",
    referrer: null,
    created_at: diasAtras(4),
    followup_status: "contacted",
    followup_note: "Retornou no WhatsApp, pediu proposta pro time todo.",
    followup_at: diasAtras(2),
    account: {
      user_id: "u-2",
      signed_up_at: diasAtras(2),
      shop_name: "Casa & Flor",
      plan: "pro",
      status: "trial",
      current_period_end: new Date(Date.now() + 5 * 864e5).toISOString(),
    },
  },
  {
    id: "l3",
    name: "Juliana Prado",
    email: "ju.prado@gmail.com",
    whatsapp: "(31) 98111-2233",
    source: "landing_pricing",
    proceeded_at: null,
    proceeded_plan: null,
    plan_cycle: null,
    referrer: "https://www.instagram.com/",
    created_at: diasAtras(9),
    followup_status: "lost",
    followup_note: "Ainda não vende na TikTok Shop.",
    followup_at: diasAtras(6),
    account: null,
  },
  {
    id: "l4",
    name: "Marcos Tavares",
    email: "marcos@tavaresacessorios.com.br",
    whatsapp: "(47) 99666-1212",
    source: "landing_pricing",
    proceeded_at: diasAtras(12),
    proceeded_plan: "erp",
    plan_cycle: "yearly",
    referrer: null,
    created_at: diasAtras(13),
    followup_status: "won",
    followup_note: "Fechou ERP anual.",
    followup_at: diasAtras(10),
    account: {
      user_id: "u-4",
      signed_up_at: diasAtras(11),
      shop_name: "Tavares Acessórios",
      plan: "erp",
      status: "active",
      current_period_end: new Date(Date.now() + 300 * 864e5).toISOString(),
    },
  },
];

function filtrar(f: LeadFilters): Lead[] {
  const termo = (f.search ?? "").trim().toLowerCase();
  return leads.filter((l) => {
    if (f.status && l.followup_status !== f.status) return false;
    if (f.temperature === "cold" && l.proceeded_at) return false;
    if (f.temperature === "hot" && !l.proceeded_at) return false;
    if (f.from && l.created_at < f.from) return false;
    if (f.to && l.created_at > f.to) return false;
    if (termo) {
      const alvo = `${l.name} ${l.email} ${l.whatsapp}`.toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

export const mockBoLeads = {
  overview: (period?: number): Promise<LeadsOverview> => {
    const days = [7, 30, 90].includes(Number(period)) ? Number(period) : 30;
    const since = diasAtras(days);
    const daily: { date: string; leads: number; hot: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      const doDia = leads.filter((l) => l.created_at.slice(0, 10) === date);
      daily.push({ date, leads: doDia.length, hot: doDia.filter((l) => l.proceeded_at).length });
    }
    const byStatus = { new: 0, contacted: 0, won: 0, lost: 0 } as Record<LeadFollowupStatus, number>;
    for (const l of leads) byStatus[l.followup_status]++;
    const hot = leads.filter((l) => l.proceeded_at).length;
    return delay({
      period: days,
      total: leads.length,
      inPeriod: leads.filter((l) => l.created_at >= since).length,
      hot,
      cold: leads.length - hot,
      withAccount: leads.filter((l) => l.account).length,
      byStatus,
      daily,
    });
  },

  listLeads: (f: LeadFilters = {}): Promise<PaginatedLeads> => {
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? 50;
    const todos = filtrar(f).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const semStatus = filtrar({ ...f, status: "" });
    const counts = {
      all: semStatus.length,
      new: semStatus.filter((l) => l.followup_status === "new").length,
      contacted: semStatus.filter((l) => l.followup_status === "contacted").length,
      won: semStatus.filter((l) => l.followup_status === "won").length,
      lost: semStatus.filter((l) => l.followup_status === "lost").length,
    };
    return delay({
      items: todos.slice((page - 1) * pageSize, page * pageSize),
      total: todos.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(todos.length / pageSize)),
      counts,
      accountsComplete: true,
    });
  },

  updateLead: (id: string, input: LeadUpdateInput): Promise<Lead> => {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return Promise.reject(new Error("Lead não encontrado"));
    if (input.status !== undefined) lead.followup_status = input.status;
    if (input.note !== undefined) lead.followup_note = input.note || null;
    lead.followup_at = new Date().toISOString();
    return delay({ ...lead });
  },

  deleteLead: (id: string): Promise<{ id: string; deleted: boolean }> => {
    leads = leads.filter((l) => l.id !== id);
    return delay({ id, deleted: true });
  },
};
