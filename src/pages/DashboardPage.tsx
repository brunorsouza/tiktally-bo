import { Link } from "react-router-dom";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Store,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { useMetrics } from "@/hooks/useBoFiscal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CenteredSpinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRelative } from "@/lib/formatters";

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "text-foreground",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between pt-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { data, isLoading, error } = useMetrics();

  if (isLoading) return <CenteredSpinner label="Carregando métricas…" />;
  if (error)
    return <p className="text-sm text-destructive">Erro ao carregar métricas: {(error as Error).message}</p>;
  if (!data) return null;

  const maxDay = Math.max(1, ...data.by_day.map((d) => d.total));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard fiscal</h1>
        <p className="text-sm text-muted-foreground">
          Visão consolidada de todas as NF-e emitidas pelos sellers via Spedy.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={FileText} label="Total de notas" value={data.total} />
        <Stat
          icon={CheckCircle2}
          label="Autorizadas"
          value={data.by_status.authorized}
          tone="text-success"
          hint={formatCurrency(data.authorized_amount)}
        />
        <Stat
          icon={XCircle}
          label="Rejeitadas"
          value={data.by_status.rejected}
          tone="text-destructive"
          hint={`${(data.rejection_rate * 100).toFixed(1)}% de rejeição`}
        />
        <Stat icon={Clock} label="Processando" value={data.by_status.processing} tone="text-blue-400" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Clock} label="Pendentes" value={data.by_status.pending} tone="text-warning" />
        <Stat icon={Ban} label="Canceladas" value={data.by_status.cancelled} />
        <Stat
          icon={Store}
          label="Sellers c/ config"
          value={data.sellers_with_config}
          hint={`${data.sellers_active} ativos`}
        />
        <Stat
          icon={AlertTriangle}
          label="Em sandbox"
          value={data.sellers_sandbox}
          hint="config de homologação"
          tone={data.sellers_sandbox > 0 ? "text-warning" : "text-foreground"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Emissões (últimos 30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.by_day.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem emissões no período.</p>
            ) : (
              <div className="space-y-1.5">
                {data.by_day.map((d) => (
                  <div key={d.day} className="flex items-center gap-3 text-xs">
                    <span className="w-14 shrink-0 text-muted-foreground">{d.day.slice(5)}</span>
                    <div className="flex h-4 flex-1 overflow-hidden rounded bg-muted">
                      <div
                        className="bg-success"
                        style={{ width: `${(d.authorized / maxDay) * 100}%` }}
                        title={`${d.authorized} autorizadas`}
                      />
                      <div
                        className="bg-destructive"
                        style={{ width: `${(d.rejected / maxDay) * 100}%` }}
                        title={`${d.rejected} rejeitadas`}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right tabular-nums">{d.total}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" /> Rejeições recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recent_rejections.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma rejeição recente. 🎉</p>
            ) : (
              <div className="space-y-2">
                {data.recent_rejections.map((r) => (
                  <Link
                    key={r.id}
                    to={`/invoices/${r.id}`}
                    className="block rounded-md border border-border p-2.5 transition hover:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {r.shop_name || r.emitter_name || "Seller"}
                      </span>
                      <Badge tone="muted">{formatRelative(r.created_at)}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-destructive">
                      {r.error_message || "Rejeitada pela SEFAZ"}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
