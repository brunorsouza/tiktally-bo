import { Badge } from "@/components/ui/badge";
import type { CouponDiscountKind, CouponStatus } from "@/types";

type Tone = "success" | "warning" | "destructive" | "muted" | "info" | "default";

const statusMap: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Ativo", tone: "success" },
  INACTIVE: { label: "Inativo", tone: "muted" },
  EXPIRED: { label: "Expirado", tone: "destructive" },
};

const kindMap: Record<CouponDiscountKind, { label: string; tone: Tone }> = {
  PERCENTAGE: { label: "Desconto %", tone: "info" },
  FIXED: { label: "Desconto R$", tone: "info" },
  TRIAL_DAYS: { label: "Trial grátis", tone: "default" },
};

export function CouponStatusBadge({ status }: { status: CouponStatus | string | null }) {
  const cfg = statusMap[status ?? ""] ?? { label: status || "—", tone: "muted" as const };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

export function DiscountKindBadge({ kind }: { kind: CouponDiscountKind | string | null }) {
  const cfg = kindMap[kind as CouponDiscountKind] ?? { label: kind || "—", tone: "muted" as const };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}
