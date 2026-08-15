/**
 * Contas do sistema e o ambiente de emissão de cada uma.
 *
 * O ambiente é buscado em LOTE: a tela tem uma linha por conta, e uma consulta
 * por linha viraria uma rajada de requisições cada vez que a lista renderiza.
 * A chave da query inclui os ids justamente pra que ela refaça quando a lista
 * de empresas mudar, e só então.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { boFiscal } from "@/lib/boFiscal";
import { useToast } from "@/components/ui/toast";
import type { NewAccountInput, SpedyEnvironmentType } from "@/types";

export const accountKeys = {
  list: ["accounts"] as const,
  plans: ["plans"] as const,
  environments: (ids: string[], sandbox: boolean) =>
    ["accounts-environments", sandbox, [...ids].sort().join(",")] as const,
};

export function useAccounts() {
  return useQuery({ queryKey: accountKeys.list, queryFn: () => boFiscal.listAccounts() });
}

/** Catálogo de planos. Muda quase nunca — daí o cache longo. */
export function usePlans() {
  return useQuery({
    queryKey: accountKeys.plans,
    queryFn: () => boFiscal.listPlans(),
    staleTime: 10 * 60_000,
  });
}

/**
 * Concessão manual de plano.
 *
 * O aviso separa os dois casos que não podem soar iguais: numa assinatura que
 * a Asaas dirige, a data gravada aqui é sobrescrita no próximo webhook — dizer
 * só "plano alterado" faria o admin achar que resolveu.
 */
export function useSetAccountPlan() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { userId: string; plan: string | null; periodEnd: string | null }) =>
      boFiscal.setAccountPlan(v.userId, v.plan, v.periodEnd),
    onSuccess: (r) => {
      if (!r.plan) {
        toast.success("Acesso removido", "A assinatura voltou a cancelada — o paywall está de pé.");
      } else if (r.gateway_managed) {
        toast.error(
          "Plano alterado, mas a assinatura é da Asaas",
          "A recorrência/cartão salvo continua valendo e o próximo webhook sobrescreve a data que você definiu.",
        );
      } else {
        toast.success(
          "Plano definido",
          "Concessão manual: não cria cobrança na Asaas e expira sozinha no vencimento.",
        );
      }
      qc.invalidateQueries({ queryKey: accountKeys.list });
    },
    onError: (e: Error) => toast.error("Falha ao definir o plano", e.message),
  });
}

export function useEnvironments(companyIds: string[], sandbox: boolean) {
  return useQuery({
    queryKey: accountKeys.environments(companyIds, sandbox),
    queryFn: () => boFiscal.companiesEnvironments(companyIds, sandbox),
    enabled: companyIds.length > 0,
  });
}

/** O status vem cru do banco; a frase do toast é em português. */
const STATUS_ASSINATURA: Record<string, string> = {
  active: "ativa",
  trialing: "em teste",
  past_due: "em atraso",
  cancelled: "cancelada",
  canceled: "cancelada",
};

/**
 * Cadastra uma conta do TikTally.
 *
 * O aviso não para no "criada": a assinatura nasce `cancelled`, então a pessoa
 * loga mas esbarra no paywall. Um toast só de sucesso faria o admin avisar o
 * cliente que está tudo pronto, e o cliente descobrir sozinho que não está.
 */
export function useCreateAccount() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: NewAccountInput) => boFiscal.createAccount(input),
    onSuccess: (r) => {
      if (!r.perfil_gravado) {
        // A conta loga, mas entrou sem CNPJ — o cadastro fiscal vai falhar
        // depois, longe daqui. Dizer isso agora é o que evita a caça ao erro.
        toast.error(
          "Conta criada, mas sem o cadastro fiscal",
          `${r.email} entrou sem CNPJ/CPF. Confira os dados no perfil antes de liberar a emissão de nota.`,
        );
      } else if (r.cnpj_duplicado) {
        toast.error(
          "Conta criada — CNPJ já usado por outra conta",
          "As duas vão disputar a mesma empresa na Spedy. Confira qual delas deve emitir.",
        );
      } else if (r.subscription_status === "active") {
        toast.success(
          "Conta criada com plano",
          `${r.email} entra já com acesso. Concessão manual: expira no vencimento e não gera cobrança na Asaas.`,
        );
      } else {
        toast.success(
          "Conta criada",
          `${r.email} já consegue entrar. A assinatura está ${STATUS_ASSINATURA[r.subscription_status ?? ""] ?? "cancelada"} — o acesso ao produto vem do pagamento.`,
        );
      }
      qc.invalidateQueries({ queryKey: accountKeys.list });
    },
    onError: (e: Error) => toast.error("Falha ao criar a conta", e.message),
  });
}

/**
 * Define o ambiente de uma CONTA.
 *
 * Um controle só pros dois casos: com empresa na Spedy, aplica agora; sem
 * empresa, fica guardado e o cadastro aplica quando criar. O aviso diferencia
 * os dois, porque "salvei" e "está valendo" não são a mesma promessa.
 */
export function useSetAccountEnvironment() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { userId: string; environmentType: SpedyEnvironmentType }) =>
      boFiscal.setAccountEnvironment(v.userId, v.environmentType),
    onSuccess: (r) => {
      const nome = r.environment === "production" ? "produção" : r.environment === "development" ? "homologação" : "simulação";
      if (r.applied) {
        toast.success(
          `Ambiente: ${nome}`,
          r.environment === "production"
            ? "As próximas NF-e desta conta valem de verdade."
            : "As próximas NF-e desta conta não terão valor fiscal.",
        );
      } else if (r.reason === "sem_empresa") {
        toast.success(
          `Ambiente: ${nome} (ao cadastrar)`,
          "A conta ainda não tem empresa na Spedy. Quando o CNPJ for cadastrado pelo TikTally, ela já nasce assim.",
        );
      } else {
        // Gravou mas a Spedy recusou: dizer só "salvo" faria a tela prometer
        // um efeito que não aconteceu na empresa que já existe.
        toast.error("Escolha salva, mas não aplicada na Spedy", r.erro);
      }
      qc.invalidateQueries({ queryKey: accountKeys.list });
      qc.invalidateQueries({ queryKey: ["accounts-environments"] });
      qc.invalidateQueries({ queryKey: ["spedy-company-settings"] });
    },
    onError: (e: Error) => toast.error("Falha ao definir o ambiente", e.message),
  });
}
