import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value ?? 0);
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? parseISO(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "dd/MM/yyyy", { locale: ptBR }) : "—";
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";
}

export function formatRelative(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? formatDistanceToNow(d, { addSuffix: true, locale: ptBR }) : "—";
}

export function formatCnpj(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 14) {
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (d.length === 11) {
    return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return raw ?? "—";
}
