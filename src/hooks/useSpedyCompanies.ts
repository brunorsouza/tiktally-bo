/**
 * Empresas na Spedy — leitura e o único controle de escrita do console fiscal.
 *
 * ## Por que esta tela existe
 * Dois problemas reais, os dois sem resposta pelo app do seller:
 *
 * 1. **CNPJ órfão.** O `POST /companies` recusa com "O CNPJ já possui uma conta
 *    vinculada", mas o `fiscal_configs` está sem `spedy_company_id`. A empresa
 *    existe lá e nós não temos o id — sem ele não dá nem pra consultar nem pra
 *    apagar, e o seller trava. `GET /companies` é o que enxerga isso.
 * 2. **Ambiente da SEFAZ.** `productInvoice.environmentType` decide se a nota
 *    vai valer de verdade. Uma loja de teste da TikTok apontando pra empresa em
 *    `production` emite NF-e REAL de pedido falso.
 *
 * ## Sandbox e produção são contas separadas
 * Não é um flag na mesma base: são URL, chave e dados próprios. Uma empresa que
 * existe numa não existe na outra, então `sandbox` faz parte da queryKey — sem
 * isso o cache serviria a lista de uma conta como se fosse da outra.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { boFiscal } from "@/lib/boFiscal";
import { useToast } from "@/components/ui/toast";
import type { SpedyEnvironmentType } from "@/types";

export const companyKeys = {
  list: (sandbox: boolean, cnpj?: string) => ["spedy-companies", sandbox, cnpj ?? ""] as const,
  settings: (id: string, sandbox: boolean) => ["spedy-company-settings", id, sandbox] as const,
  certificates: (id: string, sandbox: boolean) => ["spedy-company-certs", id, sandbox] as const,
};

export function useSpedyCompanies(sandbox: boolean, cnpj?: string) {
  return useQuery({
    queryKey: companyKeys.list(sandbox, cnpj),
    queryFn: () => boFiscal.listCompanies(sandbox, cnpj),
  });
}

export function useSpedyCompanySettings(companyId: string | undefined, sandbox: boolean) {
  return useQuery({
    queryKey: companyKeys.settings(companyId ?? "", sandbox),
    queryFn: () => boFiscal.getCompanySettings(companyId!, sandbox),
    enabled: !!companyId,
  });
}

export function useSpedyCompanyCertificates(companyId: string | undefined, sandbox: boolean) {
  return useQuery({
    queryKey: companyKeys.certificates(companyId ?? "", sandbox),
    queryFn: () => boFiscal.listCompanyCertificates(companyId!, sandbox),
    enabled: !!companyId,
  });
}

/**
 * Troca o ambiente de emissão. Invalida só a empresa mexida.
 *
 * O `PUT` manda apenas o bloco `productInvoice`: os quatro blocos são
 * independentes e enviar um bloco vazio apagaria série e numeração de quem não
 * pediu isso (a montagem do corpo está na `bo-fiscal`).
 */
export function useSetCompanyEnvironment() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { companyId: string; sandbox: boolean; environmentType: SpedyEnvironmentType }) =>
      boFiscal.setCompanyEnvironment(v.companyId, v.sandbox, v.environmentType),
    onSuccess: (_d, v) => {
      toast.success(
        v.environmentType === "production" ? "Ambiente: produção" : "Ambiente: homologação",
        v.environmentType === "production"
          ? "As próximas NF-e desta empresa valem de verdade."
          : "As próximas NF-e desta empresa não terão valor fiscal."
      );
      qc.invalidateQueries({ queryKey: companyKeys.settings(v.companyId, v.sandbox) });
      // O ambiente é lido por DUAS telas com chaves diferentes: aqui (uma
      // empresa) e em Contas (lote de empresas). Invalidar só esta deixava a
      // linha de Contas mostrando o valor antigo com o aviso de sucesso na
      // tela ao lado — a tela contradizendo a confirmação que ela mesma deu.
      qc.invalidateQueries({ queryKey: ["accounts-environments"] });
    },
    onError: (e: Error) => toast.error("Falha ao trocar o ambiente", e.message),
  });
}

/**
 * Apaga a empresa na Spedy.
 *
 * ⚠️ Não tem volta: a chave da empresa morre junto e a Spedy só a devolve na
 * criação. Se algum seller apontava pra ela, o cadastro fiscal dele volta ao
 * zero — por isso o aviso diz quantos foram afetados, e não só "excluída".
 */
export function useDeleteCompany() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { companyId: string; sandbox: boolean; confirmCnpj: string }) =>
      boFiscal.deleteCompany(v.companyId, v.sandbox, v.confirmCnpj),
    onSuccess: (r) => {
      const afetados = r.sellers_limpos.length;
      toast.success(
        r.alreadyGone ? "Empresa já não existia na Spedy" : "Empresa excluída",
        afetados
          ? `O cadastro fiscal de ${afetados} seller voltou ao estado inicial e a emissão foi desligada.`
          : "Nenhum seller estava vinculado a ela."
      );
      qc.invalidateQueries({ queryKey: ["spedy-companies"] });
      qc.invalidateQueries({ queryKey: ["sellers"] });
    },
    onError: (e: Error) => toast.error("Falha ao excluir a empresa", e.message),
  });
}

/** Grava no seller o id da empresa que já existe na Spedy. Ver `link_company`. */
export function useLinkCompany() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { userId: string; sandbox?: boolean; cnpj?: string }) =>
      boFiscal.linkCompany(v.userId, { sandbox: v.sandbox, cnpj: v.cnpj }),
    onSuccess: (r) => {
      if (r.linked) {
        toast.success("Empresa vinculada ao seller", r.aviso);
      } else if (r.reason === "not_found") {
        toast.error("Nada pra vincular", "Nenhuma empresa com esse CNPJ nesta conta da Spedy.");
      } else if (r.reason === "ambiguous") {
        toast.error("Mais de uma empresa com esse CNPJ", "Resolva pelo painel da Spedy.");
      }
      qc.invalidateQueries({ queryKey: ["sellers"] });
    },
    onError: (e: Error) => toast.error("Falha ao vincular", e.message),
  });
}
