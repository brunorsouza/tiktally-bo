import { Link } from "react-router-dom";
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
} from "@/components/ds";
import { formatRelative } from "@/lib/formatters";

export function DashboardPage() {
  const { data, isLoading, error } = useMetrics();

  if (isLoading)
    return (
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  if (error) return <ErrorState message={(error as Error).message} />;
  if (!data) return null;

  const maxDay = Math.max(1, ...data.by_day.map((d) => d.total));

  return (
    <div className="space-y-7">
      <PageHeader
        title="Dashboard fiscal"
        description="Visão consolidada de todas as NF-e emitidas pelos sellers via Spedy."
      />

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

      <StatGrid>
        <Stat label="Pendentes" value={data.by_status.pending} tone="warning" />
        <Stat label="Canceladas" value={data.by_status.cancelled} />
        <Stat label="Sellers c/ config" value={data.sellers_with_config} hint={`${data.sellers_active} ativos`} />
        <Stat
          label="Em sandbox"
          value={data.sellers_sandbox}
          hint="config de homologação"
          tone={data.sellers_sandbox > 0 ? "warning" : "default"}
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Emissões · últimos 30 dias">
          {data.by_day.length === 0 ? (
            <EmptyState title="Sem emissões no período" />
          ) : (
            <div className="space-y-1">
              {data.by_day.map((d) => (
                <div key={d.day} className="flex items-center gap-3 text-[0.6875rem]">
                  <span className="w-11 shrink-0 font-mono text-subtle">{d.day.slice(5)}</span>
                  {/* Barra empilhada: verde autorizado, vermelho rejeitado, resto é o trilho */}
                  <div className="flex h-3 flex-1 overflow-hidden rounded-[2px] bg-surface-2">
                    <div
                      className="bg-success"
                      style={{ width: `${(d.authorized / maxDay) * 100}%` }}
                      title={`${d.authorized} autorizadas`}
                    />
                    <div
                      className="bg-danger"
                      style={{ width: `${(d.rejected / maxDay) * 100}%` }}
                      title={`${d.rejected} rejeitadas`}
                    />
                  </div>
                  <span className="tabular w-7 shrink-0 text-right text-subtle">{d.total}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Rejeições recentes">
          {data.recent_rejections.length === 0 ? (
            <EmptyState title="Nenhuma rejeição recente" description="Todas as emissões do período passaram." />
          ) : (
            <div className="divide-y divide-line/50">
              {data.recent_rejections.map((r) => (
                <Link
                  key={r.id}
                  to={`/invoices/${r.id}`}
                  className="block py-2.5 transition-colors duration-ds ease-ds hover:bg-surface-1"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[0.8125rem] font-medium text-strong">
                      {r.shop_name || r.emitter_name || "Seller"}
                    </span>
                    <span className="t-caption shrink-0 tabular">{formatRelative(r.created_at)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[0.6875rem] text-danger">
                    {r.error_message || "Rejeitada pela SEFAZ"}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
