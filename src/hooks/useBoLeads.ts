import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { boLeads } from "@/lib/boLeads";
import { useToast } from "@/components/ui/toast";
import type { LeadFilters, LeadUpdateInput } from "@/types";

export const leadKeys = {
  overview: (period: number) => ["leads", "overview", period] as const,
  list: (f: LeadFilters) => ["leads", "list", f] as const,
};

function useInvalidateLeads() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["leads"] });
}

export function useLeadsOverview(period: number) {
  return useQuery({
    queryKey: leadKeys.overview(period),
    queryFn: () => boLeads.overview(period),
  });
}

export function useLeads(filters: LeadFilters) {
  return useQuery({
    queryKey: leadKeys.list(filters),
    queryFn: () => boLeads.listLeads(filters),
    placeholderData: (prev) => prev,
  });
}

export function useLeadMutations() {
  const invalidate = useInvalidateLeads();
  const toast = useToast();

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: LeadUpdateInput }) => boLeads.updateLead(id, input),
    onSuccess: () => {
      toast.success("Lead atualizado");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao atualizar lead", e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => boLeads.deleteLead(id),
    onSuccess: () => {
      toast.success("Lead excluído");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao excluir lead", e.message),
  });

  return { update, remove };
}
