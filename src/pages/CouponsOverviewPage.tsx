import { useState } from "react";
import { Ticket, CheckCircle2, Gift, Percent, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useCouponsOverview } from "@/hooks/useBoCoupons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CenteredSpinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/formatters";
import { discountLabel } from "@/lib/coupons";

const PERIODS = [7, 30, 90];

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

export function CouponsOverviewPage() {
  const [period, setPeriod] = useState(30);
  const { data, isLoading, error } = useCouponsOverview(period);

  const maxDay = data ? Math.max(1, ...data.by_day.map((d) => d.redemptions)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Cupons</h1>
          <p className="text-sm text-muted-foreground">
            Desempenho dos cupons de desconto e teste grátis usados no TikTally.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded px-3 py-1 text-xs font-medium transition ${
                period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <CenteredSpinner label="Carregando visão geral…" />
      ) : error ? (
        <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Stat icon={Ticket} label="Cupons" value={data.total_coupons} />
            <Stat icon={CheckCircle2} label="Ativos" value={data.active_coupons} tone="text-success" />
            <Stat icon={TrendingUp} label={`Resgates (${period}d)`} value={data.redemptions_in_period} hint={`${data.total_redemptions} no total`} />
            <Stat icon={Gift} label="Trials concedidos" value={data.trial_redemptions} />
            <Stat icon={Percent} label="Desconto dado" value={formatCurrency(data.discount_given_cents / 100)} tone="text-warning" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Resgates ({period}d)</CardTitle>
              </CardHeader>
              <CardContent>
                {data.by_day.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Sem resgates no período.</p>
                ) : (
                  <div className="flex h-40 items-end gap-1">
                    {data.by_day.map((d) => (
                      <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
                        <div className="flex w-full flex-1 flex-col justify-end">
                          <div
                            className="w-full rounded-t bg-primary/60"
                            style={{ height: `${(d.redemptions / maxDay) * 100}%` }}
                            title={`${d.day}: ${d.redemptions} resgates`}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground">{d.day.slice(8, 10)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mais resgatados</CardTitle>
              </CardHeader>
              <CardContent>
                {data.top_coupons.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Nenhum resgate ainda.</p>
                ) : (
                  <ol className="space-y-2">
                    {data.top_coupons.filter((c) => c.redeems > 0).slice(0, 8).map((c, i) => (
                      <li key={c.coupon_id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="w-4 text-center font-semibold text-muted-foreground">{i + 1}</span>
                          <Link to={`/coupons/${c.coupon_id}`} className="font-mono text-primary hover:underline">
                            {c.code}
                          </Link>
                        </span>
                        <span className="font-medium tabular-nums">{c.redeems}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
