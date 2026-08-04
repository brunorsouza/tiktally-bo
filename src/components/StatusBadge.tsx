import { Status } from "@/components/ds";
import type { InvoiceStatus } from "@/types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const map: Record<string, { label: string; tone: Tone }> = {
  authorized: { label: "Autorizada", tone: "success" },
  processing: { label: "Processando", tone: "info" },
  pending: { label: "Pendente", tone: "warning" },
  rejected: { label: "Rejeitada", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export function StatusBadge({ status }: { status: InvoiceStatus | string | null }) {
  const cfg = map[status ?? ""] ?? { label: status || "—", tone: "neutral" as Tone };
  return <Status tone={cfg.tone}>{cfg.label}</Status>;
}
