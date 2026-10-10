import { createGateway } from "./gateway";

const FN = import.meta.env.VITE_BO_AGENCIES_FN || "bo-agencies";

/**
 * Gateway `bo-agencies` (mesma segurança dos outros: JWT do admin + validação
 * de profiles.is_admin server-side). Lê e escreve as tabelas de agência REAIS
 * do projeto do app. Sem variante mock, como o `bo-flags`.
 *
 * Tipos ficam aqui e não em `types.ts` de propósito: são só desta tela.
 */
const call = createGateway(FN, import.meta.env.VITE_BO_AGENCIES_URL);

export interface BoAgency {
  id: string;
  name: string;
  cnpj: string | null;
  status: "active" | "suspended";
  created_at: string;
  owner_email: string | null;
  coupon_code: string | null;
  sellers_active: number;
  sellers_pending: number;
}

export interface BoAgencyCreated {
  agency: { id: string; name: string; coupon_code: string | null; owner_email: string };
  new_account: boolean;
  /** Link para o dono definir a senha (só conta nova). */
  access_url: string | null;
  email_sent: boolean;
}

export const boAgencies = {
  list: () => call<{ agencies: BoAgency[] }>("list_agencies", {}),

  create: (input: { name: string; cnpj?: string; owner_email: string }) =>
    call<BoAgencyCreated>("create_agency", input),

  setStatus: (agencyId: string, status: "active" | "suspended") =>
    call<{ id: string; status: string }>("set_status", { agency_id: agencyId, status }),
};
