import { formatCurrency } from "./formatters";
import type { Coupon, CouponDiscountKind } from "@/types";

export const PLAN_LABELS: Record<string, string> = { pro: "Pro", erp: "ERP", test: "Teste" };

/**
 * Planos que não são produto — existem só pra validar fluxo interno.
 * A tela de Preços marca esses de forma diferente pra ninguém confundir o
 * R$10 com um preço de verdade.
 */
export const INTERNAL_PLAN_KEYS = new Set(["test"]);
export const CYCLE_LABELS: Record<string, string> = {
  semiannually: "Semestral",
  yearly: "Anual",
};

export const PLAN_OPTIONS = ["pro", "erp"] as const;
export const CYCLE_OPTIONS = ["semiannually", "yearly"] as const;

/** Valor do desconto formatado conforme o tipo. */
export function discountLabel(kind: CouponDiscountKind | string, discount: number): string {
  switch (kind) {
    case "PERCENTAGE":
      return `${discount}%`;
    case "FIXED":
      return formatCurrency(discount / 100);
    case "TRIAL_DAYS":
      return `${discount} dia${discount === 1 ? "" : "s"} grátis`;
    default:
      return String(discount);
  }
}

/** "X / Y" de resgates, com ∞ para ilimitado (max_redeems negativo). */
export function redeemsLabel(c: Pick<Coupon, "redeems_count" | "max_redeems">): string {
  const limit = c.max_redeems < 0 ? "∞" : String(c.max_redeems);
  return `${c.redeems_count} / ${limit}`;
}

/** Rótulo curto de aplicabilidade (planos/ciclos). */
export function appliesToLabel(plans: string[] | null, cycles: string[] | null): string {
  const p = plans?.length ? plans.map((x) => PLAN_LABELS[x] ?? x).join(", ") : "Todos os planos";
  const c = cycles?.length ? cycles.map((x) => CYCLE_LABELS[x] ?? x).join(", ") : "Todos os ciclos";
  return `${p} · ${c}`;
}
