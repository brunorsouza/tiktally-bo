import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { boAgencies } from "@/lib/boAgencies";
import { useToast } from "@/components/ui/toast";

export const agencyKeys = {
  all: ["bo-agencies"] as const,
};

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

  return { create, setStatus };
}
