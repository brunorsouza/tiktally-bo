import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { boFiscal } from "@/lib/boFiscal";
import { useToast } from "@/components/ui/toast";
import type { GrantAdminInput } from "@/types";

export const adminKeys = {
  list: ["admins"] as const,
};

export function useAdmins() {
  return useQuery({ queryKey: adminKeys.list, queryFn: () => boFiscal.listAdmins() });
}

/**
 * Conceder e revogar acesso ao backoffice.
 *
 * As duas invalidam `["me"]` além da lista: quem acabou de ser promovido (ou
 * rebaixado) muda de papel, e o `me` é o que decide a navegação e as rotas
 * liberadas. Sem isso a mudança só apareceria no próximo F5 — que é
 * exatamente o defeito que o cache de sessão já tinha causado antes.
 */
export function useAdminMutations() {
  const qc = useQueryClient();
  const toast = useToast();

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: adminKeys.list });
    qc.invalidateQueries({ queryKey: ["me"] });
  };

  const grant = useMutation({
    mutationFn: (input: GrantAdminInput) => boFiscal.grantAdmin(input),
    onSuccess: (r) => {
      toast.success(
        r.mode === "create" ? "Conta criada e promovida a administradora" : "Acesso de administrador concedido",
        r.tambem_seller ? "Essa conta também é seller do TikTally." : undefined
      );
      invalidar();
    },
    onError: (e: Error) => toast.error("Não foi possível conceder o acesso", e.message),
  });

  const revoke = useMutation({
    mutationFn: (userId: string) => boFiscal.revokeAdmin(userId),
    onSuccess: () => {
      toast.success("Acesso de administrador removido", "A conta continua existindo — só perdeu o backoffice.");
      invalidar();
    },
    onError: (e: Error) => toast.error("Não foi possível remover o acesso", e.message),
  });

  return { grant, revoke };
}
