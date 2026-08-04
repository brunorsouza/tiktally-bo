import { Status } from "@/components/ds";
import type { CouponDiscountKind, CouponStatus } from "@/types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const statusMap: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Ativo", tone: "success" },
  INACTIVE: { label: "Inativo", tone: "neutral" },
  EXPIRED: { label: "Expirado", tone: "danger" },
};

const kindMap: Record<CouponDiscountKind, { label: string; tone: Tone }> = {
  PERCENTAGE: { label: "Desconto %", tone: "info" },
  FIXED: { label: "Desconto R$", tone: "info" },
  TRIAL_DAYS: { label: "Trial grátis", tone: "brand" },
};

/**
 * Estados de comissão. Vivia copiado em CommissionsPage e nos dois painéis —
 * três listas que podiam divergir a cada mudança de fluxo.
 */
const commissionMap: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pendente", tone: "warning" },
  approved: { label: "Aprovada", tone: "info" },
  paid: { label: "Paga", tone: "success" },
  cancelled: { label: "Cancelada", tone: "neutral" },
  reversed: { label: "Estornada", tone: "danger" },
};

/**
 * Estado EFETIVO do cupom, não o campo `status` cru.
 *
 * `coupons.status` só guarda ACTIVE/INACTIVE — expiração e esgotamento são
 * derivados de data e contador. Renderizar o status cru fazia o backoffice
 * anunciar "Ativo" num cupom que o checkout recusava como expirado.
 */
export function CouponStatusBadge({
  status,
  expired,
  exhausted,
  scheduled,
}: {
  status: CouponStatus | string | null;
  expired?: boolean;
  exhausted?: boolean;
  scheduled?: boolean;
}) {
  // A ordem importa: inativo é decisão manual e vence o resto.
  if (status !== "INACTIVE") {
    if (expired) return <Status tone="danger">Expirado</Status>;
    if (exhausted) return <Status tone="warning">Esgotado</Status>;
    if (scheduled) return <Status tone="info">Agendado</Status>;
  }
  const cfg = statusMap[status ?? ""] ?? { label: status || "—", tone: "neutral" as Tone };
  return <Status tone={cfg.tone}>{cfg.label}</Status>;
}

export function DiscountKindBadge({ kind }: { kind: CouponDiscountKind | string | null }) {
  const cfg = kindMap[kind as CouponDiscountKind] ?? { label: kind || "—", tone: "neutral" as Tone };
  return <Status tone={cfg.tone}>{cfg.label}</Status>;
}

export function CommissionStatusBadge({ status }: { status: string }) {
  const cfg = commissionMap[status] ?? { label: status, tone: "neutral" as Tone };
  return <Status tone={cfg.tone}>{cfg.label}</Status>;
}
