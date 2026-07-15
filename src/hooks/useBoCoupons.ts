import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { boCoupons } from "@/lib/boCoupons";
import { useToast } from "@/components/ui/toast";
import type { CouponFilters, CouponInput, RedemptionFilters } from "@/types";

export const couponKeys = {
  overview: (period: number) => ["coupons", "overview", period] as const,
  coupons: (f: CouponFilters) => ["coupons", "list", f] as const,
  coupon: (id: string) => ["coupons", "detail", id] as const,
  redemptions: (f: RedemptionFilters) => ["redemptions", f] as const,
};

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["coupons"] });
    qc.invalidateQueries({ queryKey: ["redemptions"] });
  };
}

// ── Queries ──────────────────────────────────────────────────────────────

export function useCouponsOverview(period: number) {
  return useQuery({
    queryKey: couponKeys.overview(period),
    queryFn: () => boCoupons.overview(period),
  });
}

export function useCoupons(filters: CouponFilters) {
  return useQuery({
    queryKey: couponKeys.coupons(filters),
    queryFn: () => boCoupons.listCoupons(filters),
    placeholderData: (prev) => prev,
  });
}

export function useCoupon(id: string | undefined) {
  return useQuery({
    queryKey: couponKeys.coupon(id ?? ""),
    queryFn: () => boCoupons.getCoupon(id!),
    enabled: !!id,
  });
}

export function useRedemptions(filters: RedemptionFilters) {
  return useQuery({
    queryKey: couponKeys.redemptions(filters),
    queryFn: () => boCoupons.listRedemptions(filters),
    placeholderData: (prev) => prev,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────

export function useCouponMutations() {
  const invalidate = useInvalidateAll();
  const toast = useToast();

  const create = useMutation({
    mutationFn: (input: CouponInput) => boCoupons.createCoupon(input),
    onSuccess: (c) => {
      toast.success("Cupom criado", c.code);
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao criar cupom", e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CouponInput> }) =>
      boCoupons.updateCoupon(id, input),
    onSuccess: () => {
      toast.success("Cupom atualizado");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao atualizar cupom", e.message),
  });

  return { create, update };
}
