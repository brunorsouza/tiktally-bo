import { cn } from "@/lib/utils";

/**
 * Gráfico de colunas do DS.
 *
 * Nasceu porque Dashboard e Visão geral desenhavam barras na unha, com
 * marcações diferentes — e as duas caíam no mesmo defeito: uma barra por
 * LINHA, o que faz 30 dias virarem 30 linhas e a tela inteira virar lista.
 * Aqui o tempo corre na horizontal, como em qualquer série temporal.
 *
 * Estética de razão: sem eixo desenhado, sem grade, sem legenda flutuante.
 * Uma linha de base, colunas finas e o rótulo do pico à direita. O que
 * informa é a forma da série — o resto é enfeite.
 */
export type ChartTone = "ink" | "brand" | "success" | "danger" | "warning" | "info" | "neutral";

const fill: Record<ChartTone, string> = {
  /* O padrão de série única. Gráfico de razão é desenhado a TINTA — reservar
     o violeta pra ação é o que impede a marca de virar papel de parede. */
  ink: "bg-[hsl(var(--text-strong))]",
  brand: "bg-brand",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  neutral: "bg-[hsl(var(--text-muted))]",
};

export interface ColumnDatum {
  key: string;
  /** Rótulo curto do eixo (ex.: "08-14"). */
  label: string;
  /** Partes empilhadas, da base pro topo. */
  parts: { value: number; tone: ChartTone; label?: string }[];
}

export function ColumnChart({
  data,
  height = 128,
  /** Mostra 1 rótulo a cada N colunas — em 30 dias, todos não cabem. */
  labelEvery,
  unit,
  className,
}: {
  data: ColumnDatum[];
  height?: number;
  labelEvery?: number;
  /** Palavra do total no título do hover: "notas", "resgates". */
  unit?: string;
  className?: string;
}) {
  const totals = data.map((d) => d.parts.reduce((s, p) => s + p.value, 0));
  const max = Math.max(1, ...totals);
  const passo = labelEvery ?? Math.max(1, Math.ceil(data.length / 8));

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => {
          const total = totals[i];
          const titulo = [
            d.label,
            `${total}${unit ? ` ${unit}` : ""}`,
            ...d.parts.filter((p) => p.label && p.value > 0).map((p) => `${p.value} ${p.label}`),
          ].join(" · ");

          return (
            <div
              key={d.key}
              title={titulo}
              className="group relative mx-auto flex h-full w-full min-w-0 max-w-[1.375rem] flex-1 flex-col justify-end"
            >
              {/* Trilho: mostra o dia sem emissão como sulco, não como vazio */}
              <span className="absolute inset-x-0 bottom-0 top-0 bg-surface-2 opacity-0 transition-opacity duration-ds group-hover:opacity-100" />
              {total === 0 ? (
                <span className="relative h-px w-full bg-line-strong" />
              ) : (
                d.parts
                  .filter((p) => p.value > 0)
                  .map((p, j) => (
                    <span
                      key={j}
                      className={cn("relative w-full", fill[p.tone])}
                      style={{ height: `${(p.value / max) * 100}%` }}
                    />
                  ))
                  .reverse()
              )}
            </div>
          );
        })}
      </div>

      {/* A linha de base é a régua da página — não um "eixo" de biblioteca */}
      <div className="mt-1.5 border-t border-line-strong" />

      <div className="mt-1.5 flex gap-[3px]">
        {data.map((d, i) => (
          <div key={d.key} className="min-w-0 flex-1 text-center">
            {i % passo === 0 && (
              <span className="tabular text-[0.5625rem] leading-none text-subtle">{d.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Legenda em linha. Ponto + rótulo + número, na mesma língua do `Status`.
 * Fica sob o gráfico porque legenda flutuando em cima do dado é o padrão que
 * toda biblioteca de gráfico repete e ninguém lê.
 */
export function ChartLegend({
  items,
}: {
  items: { tone: ChartTone; label: string; value?: React.ReactNode }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[0.6875rem] text-subtle">
          <span className={cn("h-[0.3125rem] w-[0.3125rem] shrink-0 rounded-full", fill[it.tone])} />
          {it.label}
          {it.value !== undefined && <span className="tabular font-medium text-strong">{it.value}</span>}
        </span>
      ))}
    </div>
  );
}
