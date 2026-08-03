import { useState } from "react";
import { Copy, Link2, Check } from "lucide-react";
import { useMyPerformance, useMyPixMutation, useRedemptions } from "@/hooks/useBoCoupons";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CenteredSpinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { discountLabel, redeemsLabel } from "@/lib/coupons";
import type { MyCoupon } from "@/types";

/**
 * Painel do AFILIADO (spec §8): desempenho do próprio cupom, bloco de
 * divulgação (código + link), histórico de usos (assinante mascarado) e a
 * própria chave PIX. Somente leitura — escopo forçado no servidor.
 */
export function AffiliatePanelPage() {
  const { data, isLoading, error } = useMyPerformance();
  const { data: reds } = useRedemptions({ pageSize: 50 });

  if (isLoading) return <CenteredSpinner label="Carregando seu desempenho…" />;
  if (error) return <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>;

  const p = data?.performance;
  const coupons = data?.coupons ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Meu desempenho</h1>
        <p className="text-sm text-muted-foreground">
          {data?.affiliate?.name ? `${data.affiliate.name} · ` : ""}
          Acompanhe os usos do seu cupom e suas comissões.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Usos do cupom" value={String(p?.uses ?? 0)} hint="resgates no total" />
        <Stat label="Assinaturas ativas" value={String(p?.active_subscriptions ?? 0)} hint="geradas por você" />
        <Stat label="A receber" value={formatCurrency((p?.commission_pending_cents ?? 0) / 100)} hint="pendente + aprovada" />
        <Stat label="Já recebido" value={formatCurrency((p?.commission_paid_cents ?? 0) / 100)} hint="comissões pagas" />
      </div>

      {coupons.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Você ainda não tem um cupom. Fale com o seu gestor para criar um.
          </CardContent>
        </Card>
      ) : (
        coupons.map((c) => <CouponShareCard key={c.id} coupon={c} />)
      )}

      <PixCard pixKey={data?.affiliate?.pix_key ?? null} />

      <Card>
        <CardContent className="pt-5">
          <p className="mb-3 text-sm font-medium">Histórico de usos</p>
          {!reds || reds.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum uso ainda. Divulgue seu link para começar.
            </p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Data</TH>
                  <TH>Assinante</TH>
                  <TH>Plano / ciclo</TH>
                  <TH className="text-right">Valor pago</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {reds.items.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDate(r.redeemed_at)}</TD>
                    <TD className="text-muted-foreground">{r.user_email ?? "—"}</TD>
                    <TD className="text-muted-foreground">
                      {r.plan_key ? `${r.plan_key} · ${r.cycle ?? "—"}` : "—"}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {r.net_amount_cents != null ? formatCurrency(r.net_amount_cents / 100) : "—"}
                    </TD>
                    <TD className="text-muted-foreground">{r.status ?? "—"}</TD>
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

function CouponShareCard({ coupon }: { coupon: MyCoupon }) {
  const toast = useToast();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const copy = (value: string, what: "code" | "link") => {
    navigator.clipboard?.writeText(value);
    setCopied(what);
    toast.success(what === "code" ? "Código copiado" : "Link copiado", value);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-2xl font-bold tracking-wide">{coupon.code}</p>
            <p className="text-xs text-muted-foreground">
              {discountLabel(coupon.discount_kind, coupon.discount)} de desconto ·{" "}
              {redeemsLabel({ redeems_count: coupon.redeems_count, max_redeems: coupon.max_redeems })} resgates
              {coupon.valid_until ? ` · até ${formatDate(coupon.valid_until)}` : ""}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              coupon.status === "ACTIVE" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            {coupon.status === "ACTIVE" ? "Ativo" : "Inativo"}
          </span>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Link de divulgação</p>
          <div className="flex gap-2">
            <Input readOnly value={coupon.share_url} className="font-mono text-xs" />
            <Button variant="outline" onClick={() => copy(coupon.share_url, "link")}>
              {copied === "link" ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              Link
            </Button>
            <Button variant="outline" onClick={() => copy(coupon.code, "code")}>
              {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Código
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Quem abrir esse link já chega no checkout com o desconto aplicado.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function PixCard({ pixKey }: { pixKey: string | null }) {
  const updatePix = useMyPixMutation();
  const [value, setValue] = useState(pixKey ?? "");
  const dirty = (value.trim() || null) !== pixKey;

  return (
    <Card>
      <CardContent className="pt-5">
        <p className="mb-1 text-sm font-medium">Chave PIX para recebimento</p>
        <p className="mb-3 text-xs text-muted-foreground">
          É para essa chave que suas comissões aprovadas são pagas.
        </p>
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e-mail, CPF, telefone ou chave aleatória"
          />
          <Button
            onClick={() => updatePix.mutate(value.trim() || null)}
            loading={updatePix.isPending}
            disabled={!dirty}
          >
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
