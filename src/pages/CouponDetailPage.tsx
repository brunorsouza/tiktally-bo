import { useParams } from "react-router-dom";
import { Copy } from "lucide-react";
import { useCoupon } from "@/hooks/useBoCoupons";
import { Button } from "@/components/ui/button";
import {
  BackLink,
  PageHeader,
  Panel,
  Fieldset,
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
    <div className="space-y-6">
      <BackLink to="/coupons">Cupons</BackLink>

      {/* O código É o nome do cupom — e código é DADO, então vai em mono. É a
          única tela onde o título abre mãos da serifa, de propósito. */}
      <PageHeader
        eyebrow="Cupons"
        title={coupon.code}
        meta={
          <>
            <CouponStatusBadge
              status={coupon.status}
              expired={coupon.expired}
              exhausted={coupon.exhausted}
              scheduled={coupon.scheduled}
            />
            <DiscountKindBadge kind={coupon.discount_kind} />
          </>
        }
        description={coupon.description}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(coupon.code);
              toast.success("Código copiado");
            }}
          >
            <Copy /> Copiar código
          </Button>
        }
        titleClassName="tabular text-[1.375rem] font-semibold tracking-[-0.01em]"
      />

      <Fieldset title="Condições do cupom">
        <InfoGrid>
          <Info label="Desconto" value={discountLabel(coupon.discount_kind, coupon.discount)} mono />
          <Info
            label="Resgates"
            value={<span className={coupon.exhausted ? "text-danger" : ""}>{redeemsLabel(coupon)}</span>}
            mono
          />
          <Info label="Início" value={coupon.valid_from ? formatDate(coupon.valid_from) : "—"} mono />
          <Info
            label="Validade"
            value={coupon.valid_until ? formatDate(coupon.valid_until) : "Sem expiração"}
            mono={!!coupon.valid_until}
          />
          <Info label="Aplicável a" value={appliesToLabel(coupon.applicable_plans, coupon.applicable_cycles)} />
          <Info label="Criado" value={formatDate(coupon.created_at)} mono />
        </InfoGrid>
      </Fieldset>

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
