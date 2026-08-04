import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { boCoupons } from "@/lib/boCoupons";
import { useToast } from "@/components/ui/toast";
import type {
  AffiliateFilters,
  AffiliateInput,
  AffiliateUserInput,
  BusinessInput,
  BusinessUserInput,
  CommissionFilters,
  CouponFilters,
  CouponInput,
  Price,
  RedemptionFilters,
} from "@/types";

export const couponKeys = {
  overview: (period: number) => ["coupons", "overview", period] as const,
  coupons: (f: CouponFilters) => ["coupons", "list", f] as const,
  coupon: (id: string) => ["coupons", "detail", id] as const,
  redemptions: (f: RedemptionFilters) => ["redemptions", f] as const,
  pricing: () => ["pricing"] as const,
  affiliates: (f: AffiliateFilters) => ["affiliates", f] as const,
  businesses: (search?: string) => ["businesses", search ?? ""] as const,
  commissions: (f: CommissionFilters) => ["commissions", f] as const,
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

  const remove = useMutation({
    mutationFn: (id: string) => boCoupons.deleteCoupon(id),
    onSuccess: (r) => {
      if (r.archived) toast.success("Cupom arquivado", r.reason ?? undefined);
      else toast.success("Cupom excluído");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao excluir cupom", e.message),
  });

  return { create, update, remove };
}

// ── Papel do usuário (RBAC) ────────────────────────────────────────────────

export function useMe() {
  return useQuery({
    queryKey: ["me"] as const,
    queryFn: () => boCoupons.me(),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Painel do afiliado: cupons + desempenho. */
export function useMyPerformance(enabled = true) {
  return useQuery({ queryKey: ["my-performance"] as const, queryFn: () => boCoupons.myPerformance(), enabled });
}

export function useMyPixMutation() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (pixKey: string | null) => boCoupons.updateMyPix(pixKey),
    onSuccess: () => {
      toast.success("Chave PIX atualizada");
      qc.invalidateQueries({ queryKey: ["my-performance"] });
    },
    onError: (e: Error) => toast.error("Falha ao atualizar chave PIX", e.message),
  });
}

/** Acesso do afiliado: criar login novo ou vincular conta existente. */
export function useAffiliateUserMutation() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["affiliates"] });

  const create = useMutation({
    mutationFn: (input: AffiliateUserInput) => boCoupons.createAffiliateUser(input),
    onSuccess: (r) => {
      toast.success("Acesso criado", r.email);
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao criar acesso", e.message),
  });

  const link = useMutation({
    mutationFn: ({ affiliateId, email }: { affiliateId: string; email: string }) =>
      boCoupons.linkAffiliateUser(affiliateId, email),
    onSuccess: (r) => {
      toast.success("Conta vinculada", r.email);
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao vincular conta", e.message),
  });

  return { create, link };
}

export function useBusinessUserMutation() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["businesses"] });

  const create = useMutation({
    mutationFn: (input: BusinessUserInput) => boCoupons.createBusinessUser(input),
    onSuccess: (r) => {
      toast.success("Acesso criado", r.email);
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao criar acesso", e.message),
  });

  const link = useMutation({
    mutationFn: ({ businessId, email }: { businessId: string; email: string }) =>
      boCoupons.linkBusinessUser(businessId, email),
    onSuccess: (r) => {
      toast.success("Conta vinculada", r.email);
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao vincular conta", e.message),
  });

  return { create, link };
}

// ── Planos & Preços ────────────────────────────────────────────────────────

export function usePricing() {
  return useQuery({ queryKey: couponKeys.pricing(), queryFn: () => boCoupons.listPricing() });
}

export function usePricingMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["pricing"] });

  const updatePrice = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Pick<Price, "installment_amount_cents" | "total_amount_cents" | "installments">> }) =>
      boCoupons.updatePrice(id, input),
    onSuccess: () => {
      toast.success("Preço atualizado", "Vale para novas assinaturas");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao atualizar preço", e.message),
  });

  const updateSetting = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => boCoupons.updateSetting(key, value),
    onSuccess: () => {
      toast.success("Configuração atualizada");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao atualizar configuração", e.message),
  });

  return { updatePrice, updateSetting };
}

// ── Afiliados ──────────────────────────────────────────────────────────────

export function useAffiliates(filters: AffiliateFilters = {}) {
  return useQuery({
    queryKey: couponKeys.affiliates(filters),
    queryFn: () => boCoupons.listAffiliates(filters),
    placeholderData: (prev) => prev,
  });
}

export function useAffiliateMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["affiliates"] });
    qc.invalidateQueries({ queryKey: ["businesses"] });
  };

  const create = useMutation({
    mutationFn: (input: AffiliateInput) => boCoupons.createAffiliate(input),
    onSuccess: (a) => {
      toast.success("Afiliado criado", a.name);
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao criar afiliado", e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AffiliateInput> }) => boCoupons.updateAffiliate(id, input),
    onSuccess: () => {
      toast.success("Afiliado atualizado");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao atualizar afiliado", e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => boCoupons.deleteAffiliate(id),
    onSuccess: (r) => {
      if (r.suspended) toast.success("Afiliado suspenso", r.reason ?? undefined);
      else toast.success("Afiliado excluído");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao excluir afiliado", e.message),
  });

  return { create, update, remove };
}

// ── Businesses ─────────────────────────────────────────────────────────────

/** Lista businesses (admin). `enabled=false` p/ papéis sem permissão (business). */
export function useBusinesses(search?: string, enabled = true) {
  return useQuery({
    queryKey: couponKeys.businesses(search),
    queryFn: () => boCoupons.listBusinesses(search),
    enabled,
  });
}

export function useBusinessMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["businesses"] });

  const create = useMutation({
    mutationFn: (input: BusinessInput) => boCoupons.createBusiness(input),
    onSuccess: (b) => {
      toast.success("Business criado", b.name);
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao criar business", e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<BusinessInput> }) => boCoupons.updateBusiness(id, input),
    onSuccess: () => {
      toast.success("Business atualizado");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao atualizar business", e.message),
  });

  return { create, update };
}

// ── Comissões ──────────────────────────────────────────────────────────────

export function useCommissions(filters: CommissionFilters = {}) {
  return useQuery({
    queryKey: couponKeys.commissions(filters),
    queryFn: () => boCoupons.listCommissions(filters),
    placeholderData: (prev) => prev,
  });
}

export function useCommissionMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["commissions"] });

  const approve = useMutation({
    mutationFn: (id: string) => boCoupons.approveCommission(id),
    onSuccess: () => {
      toast.success("Comissão aprovada");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao aprovar comissão", e.message),
  });

  const pay = useMutation({
    mutationFn: ({ id, paymentReference }: { id: string; paymentReference?: string }) => boCoupons.payCommission(id, paymentReference),
    onSuccess: () => {
      toast.success("Comissão paga");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao registrar pagamento", e.message),
  });

  const reverse = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => boCoupons.reverseCommission(id, reason),
    onSuccess: () => {
      toast.success("Comissão estornada");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao estornar comissão", e.message),
  });

  return { approve, pay, reverse };
}
