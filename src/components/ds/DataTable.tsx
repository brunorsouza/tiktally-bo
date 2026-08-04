import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, TableSkeleton } from "./index";

/**
 * Tabela de dados do DS.
 *
 * Decisões de UX que a tabela solta não tinha:
 * - **Coluna numérica alinha à direita** por padrão (`align: "right"`), com
 *   dígitos tabulares. É o que deixa o olho comparar grandeza sem ler dígito
 *   a dígito — essencial numa tela de dinheiro.
 * - **Cabeçalho fixo** ao rolar: você nunca perde de vista o que é cada coluna.
 * - **Linha inteira clicável** quando há `onRowClick`, com foco por teclado —
 *   não só um link minúsculo no meio da linha.
 * - **Loading/empty/error embutidos**, pra cada tela não inventar o seu.
 * - **Zebra sutil no hover**, não listrado fixo: menos ruído em repouso.
 */
export interface Column<T> {
  /** Cabeçalho. String vazia para coluna de ações. */
  header: ReactNode;
  /** Conteúdo da célula. */
  cell: (row: T) => ReactNode;
  /** Alinhamento — use "right" para números/dinheiro. */
  align?: "left" | "right" | "center";
  /** Largura fixa (ex.: "8rem") para não deixar a coluna respirar demais. */
  width?: string;
  /** Esconde em telas estreitas. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRowClick?: (row: T) => void;
  /** Estado vazio customizado. */
  empty?: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode };
  className?: string;
}

const alignCls = { left: "text-left", right: "text-right", center: "text-center" } as const;
const hideCls = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRowClick,
  empty,
  className,
}: DataTableProps<T>) {
  if (loading) return <TableSkeleton cols={columns.length} />;
  if (error) return <ErrorState message={error} />;
  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        title={empty?.title ?? "Nada por aqui"}
        description={empty?.description}
        action={empty?.action}
        icon={empty?.icon}
      />
    );
  }

  return (
    <div className={cn("relative overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[0.8125rem]">
        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                style={c.width ? { width: c.width } : undefined}
                className={cn(
                  "border-b border-line px-4 py-2.5 font-medium text-subtle",
                  "text-[0.6875rem] uppercase tracking-[0.06em]",
                  alignCls[c.align ?? "left"],
                  c.hideBelow && hideCls[c.hideBelow]
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const clickable = !!onRowClick;
            return (
              <tr
                key={rowKey(row)}
                onClick={clickable ? () => onRowClick!(row) : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick!(row);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "border-b border-line/60 transition-colors duration-ds ease-ds last:border-0",
                  clickable && "cursor-pointer hover:bg-surface-3 focus-visible:bg-surface-3"
                )}
              >
                {columns.map((c, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-4 py-2.5 text-[hsl(var(--text))]",
                      alignCls[c.align ?? "left"],
                      c.align === "right" && "tabular",
                      c.hideBelow && hideCls[c.hideBelow],
                      c.className
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Célula primária: nome em destaque + linha secundária discreta. */
export function CellStack({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-strong">{title}</div>
      {subtitle && <div className="t-caption truncate">{subtitle}</div>}
    </div>
  );
}

/** Ações da linha — só aparecem no hover, pra não poluir a varredura. */
export function RowActions({ children }: { children: ReactNode }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex items-center justify-end gap-0.5 opacity-60 transition-opacity duration-ds ease-ds group-hover:opacity-100 [tr:hover_&]:opacity-100 [tr:focus-within_&]:opacity-100"
    >
      {children}
    </div>
  );
}
