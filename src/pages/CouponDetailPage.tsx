import { useParams } from "react-router-dom";
import { Copy } from "lucide-react";
import { useCoupon } from "@/hooks/useBoCoupons";
import { Button } from "@/components/ui/button";
import {
  BackLink,
  Panel,
  Surface,
  InfoGrid,
  Info,
  Status,
  Money,
  ErrorState,
  Skeleton,
} from "@/components/ds";
import { DataTable, type Column } from "@/components/ds/DataTable";
import { CouponStatusBadge, DiscountKindBadge } from "@/components/CouponBadges";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { discountLabel, redeemsLabel, appliesToLabel } from "@/lib/coupons";
import type { CouponRedemption } from "@/types";

export function CouponDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { data, isLoading, error } = useCoupon(id);

  if (isLoading)
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
      </div>
    );
  if (error) return <ErrorState message={(error as Error).message} />;
  if (!data) return null;

  const { coupon, redemptions } = data;

  const colunas: Column<CouponRedemption>[] = [
    {
      header: "Data",
      width: "11rem",
      cell: (r) => <span className="tabular text-subtle">{formatDateTime(r.redeemed_at)}</span>,
    },
    { header: "Usuário", cell: (r) => <span className="text-subtle">{r.user_email ?? r.user_id}</span> },
    {
      header: "Tipo",
      width: "7rem",
      cell: (r) => (r.billing_id ? <Status tone="info">Compra</Status> : <Status tone="neutral">Trial</Status>),
    },
    {
      header: "Desconto",
      align: "right",
      width: "8rem",
      cell: (r) =>
        r.discount_cents > 0 ? <Money cents={r.discount_cents} tone="success" /> : <span className="text-subtle">—</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <BackLink to="/coupons">Cupons</BackLink>

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <h1 className="font-mono text-[1.375rem] font-semibold leading-none tracking-tight text-strong">
            {coupon.code}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <CouponStatusBadge status={coupon.status} />
            <DiscountKindBadge kind={coupon.discount_kind} />
            {coupon.description && <span className="t-caption">{coupon.description}</span>}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(coupon.code);
            toast.success("Código copiado");
          }}
        >
          <Copy /> Copiar código
        </Button>
      </header>

      <Surface className="p-4">
        <InfoGrid>
          <Info label="Desconto" value={discountLabel(coupon.discount_kind, coupon.discount)} />
          <Info
            label="Resgates"
            value={<span className={coupon.exhausted ? "text-danger" : ""}>{redeemsLabel(coupon)}</span>}
          />
          <Info label="Início" value={coupon.valid_from ? formatDate(coupon.valid_from) : "—"} />
          <Info label="Validade" value={coupon.valid_until ? formatDate(coupon.valid_until) : "Sem expiração"} />
          <Info label="Aplicável a" value={appliesToLabel(coupon.applicable_plans, coupon.applicable_cycles)} />
          <Info label="Criado" value={formatDate(coupon.created_at)} />
        </InfoGrid>
      </Surface>

      <Panel title={`Resgates · ${redemptions.length}`}>
        <DataTable
          rows={redemptions}
          rowKey={(r) => r.id}
          empty={{ title: "Nenhum resgate ainda" }}
          columns={colunas}
        />
      </Panel>
    </div>
  );
}
