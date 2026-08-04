import { useState } from "react";
import { Link } from "react-router-dom";
import { useCouponsOverview } from "@/hooks/useBoCoupons";
import {
  PageHeader,
  Panel,
  Segmented,
  Stat,
  StatGrid,
  Money,
  EmptyState,
  ErrorState,
  Skeleton,
} from "@/components/ds";

const PERIODS = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

export function CouponsOverviewPage() {
  const [period, setPeriod] = useState(30);
  const { data, isLoading, error } = useCouponsOverview(period);

  const maxDay = data ? Math.max(1, ...data.by_day.map((d) => d.redemptions)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cupons"
        description="Desempenho dos cupons de desconto e teste grátis usados no TikTally."
        actions={<Segmented value={period} options={PERIODS} onChange={setPeriod} />}
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : data ? (
        <>
          <StatGrid cols={5}>
            <Stat label="Cupons" value={data.total_coupons} />
            <Stat label="Ativos" value={data.active_coupons} tone="success" />
            <Stat
              label={`Resgates ${period}d`}
              value={data.redemptions_in_period}
              hint={`${data.total_redemptions} no total`}
            />
            <Stat label="Trials concedidos" value={data.trial_redemptions} />
            <Stat
              label="Desconto dado"
              value={<Money cents={data.discount_given_cents} />}
              tone="warning"
            />
          </StatGrid>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title={`Resgates por dia · ${period}d`} className="lg:col-span-2">
              {data.by_day.length === 0 ? (
                <EmptyState title="Sem resgates no período" />
              ) : (
                <div className="flex h-40 items-end gap-px">
                  {data.by_day.map((d) => (
                    <div key={d.day} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <div className="flex w-full flex-1 flex-col justify-end">
                        <div
                          className="w-full bg-brand/50 transition-colors duration-ds ease-ds group-hover:bg-brand"
                          style={{ height: `${(d.redemptions / maxDay) * 100}%` }}
                          title={`${d.day}: ${d.redemptions} resgates`}
                        />
                      </div>
                      <span className="font-mono text-[0.5rem] text-subtle">{d.day.slice(8, 10)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Mais resgatados">
              {data.top_coupons.filter((c) => c.redeems > 0).length === 0 ? (
                <EmptyState title="Nenhum resgate ainda" />
              ) : (
                <ol className="divide-y divide-line/50">
                  {data.top_coupons
                    .filter((c) => c.redeems > 0)
                    .slice(0, 8)
                    .map((c, i) => (
                      <li key={c.coupon_id} className="flex items-center justify-between gap-3 py-1.5 text-[0.8125rem]">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="tabular w-3 shrink-0 text-right text-[0.625rem] text-subtle">{i + 1}</span>
                          <Link
                            to={`/coupons/${c.coupon_id}`}
                            className="truncate font-mono text-strong transition-colors duration-ds ease-ds hover:text-brand-strong"
                          >
                            {c.code}
                          </Link>
                        </span>
                        <span className="tabular shrink-0 font-medium text-strong">{c.redeems}</span>
                      </li>
                    ))}
                </ol>
              )}
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
