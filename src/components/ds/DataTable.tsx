import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, TableSkeleton } from "./index";

/**
 * Tabela de dados do DS.
 *
 * A tabela É a tela nesse produto — então ela ganha a FOLHA pra si: fundo
 * próprio, fio em volta, sombra rasa. Não é decoração; é o que separa "página
 * de registro" de "linhas soltas no fundo do app".
 *
 * Decisões de UX que a tabela solta não tinha:
 * - **Coluna numérica alinha à direita** por padrão (`align: "right"`), com
 *   dígitos tabulares — o olho compara grandeza sem ler dígito a dígito.
 * - **Cabeçalho fixo** ao rolar, com régua dupla (a assinatura do livro-razão).
 * - **Linha inteira clicável** quando há `onRowClick`, com foco por teclado —
 *   não só um link minúsculo no meio da linha.
 * - **Loading/empty/error embutidos**, pra cada tela não inventar o seu.
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
  /** Sem a folha em volta — quando a tabela já está dentro de um painel. */
  bare?: boolean;
  /**
   * Busca, filtros e ações da lista. Ficam DENTRO da folha, presos ao topo da
   * tabela — não flutuando no fundo da página.
   *
   * "A holistic structure as opposed to fragmentation": o controle e o dado que
   * ele governa são uma coisa só. Solto lá em cima, o filtro vira mais um
   * elemento na página e a relação com a tabela fica por conta do operador.
   */
  toolbar?: ReactNode;
  /**
   * Rodapé da lista — na prática, a paginação. Simétrico ao `toolbar`: fecha a
   * folha por baixo, pra o bloco ser UMA coisa (busca + dado + navegação) em
   * vez de três elementos soltos empilhados na página.
   */
  footer?: ReactNode;
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
  bare,
  toolbar,
  footer,
  className,
}: DataTableProps<T>) {
  const folha = bare ? "relative" : "relative rounded-lg border border-line bg-surface-1 shadow-2";

  const moldura = (conteudo: ReactNode) => (
    <div className={cn(folha, className)}>
      {toolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">{toolbar}</div>
      )}
      {conteudo}
      {footer && <div className="border-t border-line px-4 py-2.5">{footer}</div>}
    </div>
  );

  if (loading) return moldura(<TableSkeleton cols={columns.length} />);
  if (error) return moldura(<ErrorState message={error} />);
  if (!rows || rows.length === 0)
    return moldura(
      <EmptyState
        title={empty?.title ?? "Nada por aqui"}
        description={empty?.description}
        action={empty?.action}
        icon={empty?.icon}
      />
    );

  return moldura(
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10">
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={cn(
                  // Régua dupla no cabeçalho — o fio grosso com o fino embaixo
                  "border-b border-line bg-surface-2 px-4 py-2.5 text-subtle",
                  "whitespace-nowrap text-[0.625rem] font-semibold uppercase leading-none tracking-[0.09em]",
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
                  "group border-b border-line transition-colors duration-ds ease-ds last:border-0",
                  clickable && "cursor-pointer hover:bg-surface-3 focus-visible:bg-surface-3"
                )}
              >
                {columns.map((c, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-4 py-3 text-[0.8125rem] text-ink",
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
      <div className="truncate text-[0.8125rem] font-medium leading-snug text-strong">{title}</div>
      {subtitle && <div className="truncate text-[0.6875rem] leading-snug text-subtle">{subtitle}</div>}
    </div>
  );
}

/** Ações da linha — só ganham contorno no hover, pra não poluir a varredura. */
export function RowActions({ children }: { children: ReactNode }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex items-center justify-end gap-0.5 opacity-75 transition-opacity duration-ds ease-ds group-hover:opacity-100 [tr:focus-within_&]:opacity-100 [tr:hover_&]:opacity-100"
    >
      {children}
    </div>
  );
}
