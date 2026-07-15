import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/types";

const map: Record<string, { label: string; tone: "success" | "warning" | "destructive" | "muted" | "info" }> = {
  authorized: { label: "Autorizada", tone: "success" },
  processing: { label: "Processando", tone: "info" },
  pending: { label: "Pendente", tone: "warning" },
  rejected: { label: "Rejeitada", tone: "destructive" },
  cancelled: { label: "Cancelada", tone: "muted" },
};

export function StatusBadge({ status }: { status: InvoiceStatus | string | null }) {
  const cfg = map[status ?? ""] ?? { label: status || "—", tone: "muted" as const };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}
