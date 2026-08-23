import { useMetrics } from "@/hooks/useBoFiscal";
import {
  PageHeader,
  Panel,
  Stat,
  StatGrid,
  Money,
  EmptyState,
  ErrorState,
  Skeleton,
  ColumnChart,
  ChartLegend,
} from "@/components/ds";

/**
 * Resumo em linha.
 *
 * Os números de contexto (pendentes, canceladas, sellers) não merecem o mesmo
 * corpo dos quatro primeiros — se tudo é métrica grande, nada é. Aqui eles
 * viram a linha de fechamento do documento: rótulo, valor, régua entre um e
 * outro.
 */
function ResumoLinha({ itens }: { itens: { label: string; value: React.ReactNode; hint?: string }[] }) {
  return (
    <div className="flex flex-wrap items-stretch gap-y-4 rounded-lg border border-line bg-surface-1 px-6 py-4 shadow-2">
      {itens.map((it, i) => (
        <div key={it.label} className={i === 0 ? "pr-8" : "border-l border-line pl-8 pr-8"}>
          <p className="t-overline">{it.label}</p>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className="tabular text-[0.9375rem] font-medium text-strong">{it.value}</span>
            {it.hint && <span className="t-caption">{it.hint}</span>}
          </p>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading, error } = useMetrics();

  if (isLoading)
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  if (error) return <ErrorState message={(error as Error).message} />;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Fiscal"
        title="Dashboard"
        description="Visão consolidada de todas as NF-e emitidas pelos sellers via Spedy."
      />

      {/* Os quatro que importam. O resto é contexto e vai na linha de baixo. */}
      <StatGrid>
        <Stat label="Total de notas" value={data.total} />
        <Stat
          label="Autorizadas"
          value={data.by_status.authorized}
          tone="success"
          hint={<Money cents={Math.round(data.authorized_amount * 100)} />}
        />
        <Stat
          label="Rejeitadas"
          value={data.by_status.rejected}
          tone="danger"
          hint={`${(data.rejection_rate * 100).toFixed(1)}% de rejeição`}
        />
        <Stat label="Processando" value={data.by_status.processing} tone="brand" />
      </StatGrid>

      <ResumoLinha
        itens={[
          { label: "Pendentes", value: data.by_status.pending },
          { label: "Canceladas", value: data.by_status.cancelled },
          { label: "Sellers c/ config", value: data.sellers_with_config, hint: `${data.sellers_active} ativos` },
          { label: "Em sandbox", value: data.sellers_sandbox, hint: "homologação" },
        ]}
      />

      {/*
        As "rejeições recentes" saíram daqui: elas viraram fila de trabalho no
        painel lateral, visível em TODA tela em vez de só nesta. Repetir a lista
        nos dois lugares não é redundância inofensiva — são dois lugares pra
        conferir e dois pra divergir.

        O que sobra no centro é o que o painel não faz: a série histórica, que
        precisa de largura pra ser lida.
      */}
      <Panel title="Emissões · últimos 30 dias">
        {data.by_day.length === 0 ? (
          <EmptyState title="Sem emissões no período" />
        ) : (
          <div className="space-y-3">
            <ColumnChart
              height={180}
              unit="notas"
              data={data.by_day.map((d) => ({
                key: d.day,
                label: d.day.slice(5),
                parts: [
                  { value: d.authorized, tone: "success", label: "autorizadas" },
                  { value: d.rejected, tone: "danger", label: "rejeitadas" },
                  {
                    value: Math.max(0, d.total - d.authorized - d.rejected),
                    tone: "neutral",
                    label: "em outros estados",
                  },
                ],
              }))}
            />
            <ChartLegend
              items={[
                { tone: "success", label: "autorizadas", value: data.by_status.authorized },
                { tone: "danger", label: "rejeitadas", value: data.by_status.rejected },
                { tone: "neutral", label: "demais" },
              ]}
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
