import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Copy } from "lucide-react";
import { useCoupon } from "@/hooks/useBoCoupons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CouponStatusBadge, DiscountKindBadge } from "@/components/CouponBadges";
import { Badge } from "@/components/ui/badge";
import { CenteredSpinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/formatters";
import { discountLabel, redeemsLabel, appliesToLabel } from "@/lib/coupons";

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}

export function CouponDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { data, isLoading, error } = useCoupon(id);

  if (isLoading) return <CenteredSpinner label="Carregando cupom…" />;
  if (error) return <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  const { coupon, redemptions } = data;

  return (
    <div className="space-y-5">
      <Link to="/coupons" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Cupons
      </Link>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-xl font-semibold">{coupon.code}</h1>
          <CouponStatusBadge status={coupon.status} />
          <DiscountKindBadge kind={coupon.discount_kind} />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(coupon.code);
            toast.success("Código copiado");
          }}
        >
          <Copy className="h-4 w-4" /> Copiar código
        </Button>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 pt-5 sm:grid-cols-3 lg:grid-cols-4">
          <Info label="Desconto" value={discountLabel(coupon.discount_kind, coupon.discount)} />
          <Info
            label="Resgates"
            value={<span className={coupon.exhausted ? "text-destructive" : ""}>{redeemsLabel(coupon)}</span>}
          />
          <Info label="Início" value={coupon.valid_from ? formatDate(coupon.valid_from) : "—"} />
          <Info label="Validade" value={coupon.valid_until ? formatDate(coupon.valid_until) : "Sem expiração"} />
          <Info label="Aplicável a" value={appliesToLabel(coupon.applicable_plans, coupon.applicable_cycles)} />
          <Info label="Criado" value={formatDate(coupon.created_at)} />
          {coupon.description && <Info label="Descrição" value={coupon.description} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resgates ({redemptions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {redemptions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum resgate ainda.</p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Data</TH>
                  <TH>Usuário</TH>
                  <TH>Tipo</TH>
                  <TH className="text-right">Desconto</TH>
                </TR>
              </THead>
              <TBody>
                {redemptions.map((r) => (
                  <TR key={r.id} className="hover:bg-transparent">
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.redeemed_at)}</TD>
                    <TD className="text-xs">{r.user_email ?? r.user_id}</TD>
                    <TD>
                      {r.billing_id ? (
                        <Badge tone="info">Compra</Badge>
                      ) : (
                        <Badge tone="default">Trial</Badge>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {r.discount_cents > 0 ? formatCurrency(r.discount_cents / 100) : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
