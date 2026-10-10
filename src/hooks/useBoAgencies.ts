import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { boAgencies } from "@/lib/boAgencies";
import { useToast } from "@/components/ui/toast";

export const agencyKeys = {
  all: ["bo-agencies"] as const,
  sellers: (id: string) => ["bo-agencies", "sellers", id] as const,
};

export function useAgencySellers(agencyId: string | null) {
  return useQuery({
    queryKey: agencyKeys.sellers(agencyId ?? ""),
    queryFn: () => boAgencies.sellers(agencyId!),
    enabled: !!agencyId,
    staleTime: 0,
  });
}

export function useAgencies() {
  return useQuery({ queryKey: agencyKeys.all, queryFn: () => boAgencies.list(), staleTime: 0 });
}

export function useAgencyMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => qc.invalidateQueries({ queryKey: agencyKeys.all });

  const create = useMutation({
    mutationFn: boAgencies.create,
    onSuccess: () => {
      toast.success("Agência criada");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "suspended" }) => boAgencies.setStatus(id, status),
    onSuccess: (_d, v) => {
      toast.success(v.status === "active" ? "Agência reativada" : "Agência suspensa");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Invalida a lista (contadores) e os sellers da agência de uma vez: as duas
  // chaves começam com "bo-agencies".
  const addSeller = useMutation({
    mutationFn: ({ agencyId, email, notify }: { agencyId: string; email: string; notify: boolean }) =>
      boAgencies.addSeller(agencyId, email, notify),
    onSuccess: () => {
      toast.success("Seller vinculado");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeSeller = useMutation({
    mutationFn: (linkId: string) => boAgencies.removeSeller(linkId),
    onSuccess: () => {
      toast.success("Vínculo removido");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { create, setStatus, addSeller, removeSeller };
}
