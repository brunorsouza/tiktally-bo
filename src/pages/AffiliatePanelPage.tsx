import { useState } from "react";
import { Copy, Link2, Check, Ticket } from "lucide-react";
import { useMyPerformance, useMyPixMutation, useRedemptions } from "@/hooks/useBoCoupons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  Panel,
  Surface,
  Stat,
  StatGrid,
  Status,
  Money,
  EmptyState,
  ErrorState,
  Skeleton,
} from "@/components/ds";
import { DataTable, type Column } from "@/components/ds/DataTable";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/formatters";
import { discountLabel, redeemsLabel } from "@/lib/coupons";
import type { MyCoupon, CouponRedemption } from "@/types";

/**
 * Painel do AFILIADO (spec §8): desempenho do próprio cupom, bloco de
 * divulgação (código + link), histórico de usos (assinante mascarado) e a
 * própria chave PIX. Somente leitura — escopo forçado no servidor.
 */
export function AffiliatePanelPage() {
  const { data, isLoading, error } = useMyPerformance();
  const { data: reds } = useRedemptions({ pageSize: 50 });

  if (isLoading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-12" />
        <Skeleton className="h-24" />
      </div>
    );
  if (error) return <ErrorState message={(error as Error).message} />;

  const p = data?.performance;
  const coupons = data?.coupons ?? [];

  const colunas: Column<CouponRedemption>[] = [
    { header: "Data", width: "7rem", cell: (r) => <span className="tabular text-subtle">{formatDate(r.redeemed_at)}</span> },
    { header: "Assinante", cell: (r) => <span className="text-subtle">{r.user_email ?? "—"}</span> },
    {
      header: "Plano / ciclo",
      width: "11rem",
      hideBelow: "md",
      cell: (r) => (r.plan_key ? `${r.plan_key} · ${r.cycle ?? "—"}` : "—"),
    },
    {
      header: "Valor pago",
      align: "right",
      width: "8rem",
      cell: (r) => (r.net_amount_cents != null ? <Money cents={r.net_amount_cents} /> : "—"),
    },
    { header: "Status", width: "7rem", cell: (r) => <span className="text-subtle">{r.status ?? "—"}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meu desempenho"
        description={`${data?.affiliate?.name ? `${data.affiliate.name} · ` : ""}Acompanhe os usos do seu cupom e suas comissões.`}
      />

      <StatGrid>
        <Stat label="Usos do cupom" value={p?.uses ?? 0} hint="resgates no total" />
        <Stat label="Assinaturas ativas" value={p?.active_subscriptions ?? 0} hint="geradas por você" />
        <Stat
          label="A receber"
          value={<Money cents={p?.commission_pending_cents ?? 0} />}
          hint="pendente + aprovada"
          tone="brand"
        />
        <Stat
          label="Já recebido"
          value={<Money cents={p?.commission_paid_cents ?? 0} />}
          hint="comissões pagas"
          tone="success"
        />
      </StatGrid>

      {coupons.length === 0 ? (
        <Surface>
          <EmptyState
            title="Você ainda não tem um cupom"
            description="Fale com o seu gestor para criar um e começar a divulgar."
            icon={<Ticket />}
          />
        </Surface>
      ) : (
        coupons.map((c) => <CouponShare key={c.id} coupon={c} />)
      )}

      <PixPanel pixKey={data?.affiliate?.pix_key ?? null} />

      <Panel title="Histórico de usos">
        <DataTable
          rows={reds?.items}
          rowKey={(r) => r.id}
          empty={{ title: "Nenhum uso ainda", description: "Divulgue seu link para começar." }}
          columns={colunas}
        />
      </Panel>
    </div>
  );
}

/**
 * O cupom é o produto do afiliado — então ele é o herói da tela: código em
 * mono, grande, com a régua da marca. Não mais um cartão como os outros.
 */
function CouponShare({ coupon }: { coupon: MyCoupon }) {
  const toast = useToast();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const copy = (value: string, what: "code" | "link") => {
    navigator.clipboard?.writeText(value);
    setCopied(what);
    toast.success(what === "code" ? "Código copiado" : "Link copiado", value);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Surface className="border-l-2 border-l-brand p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[1.75rem] font-semibold leading-none tracking-tight text-strong">
            {coupon.code}
          </p>
          <p className="t-caption mt-2">
            {discountLabel(coupon.discount_kind, coupon.discount)} de desconto ·{" "}
            {redeemsLabel({ redeems_count: coupon.redeems_count, max_redeems: coupon.max_redeems })} resgates
            {coupon.valid_until ? ` · até ${formatDate(coupon.valid_until)}` : ""}
          </p>
        </div>
        <Status tone={coupon.status === "ACTIVE" ? "success" : "neutral"}>
          {coupon.status === "ACTIVE" ? "Ativo" : "Inativo"}
        </Status>
      </div>

      <div className="mt-5">
        <p className="t-label mb-1.5">Link de divulgação</p>
        <div className="flex gap-2">
          <Input readOnly value={coupon.share_url} className="font-mono text-[0.75rem]" />
          <Button variant="outline" onClick={() => copy(coupon.share_url, "link")}>
            {copied === "link" ? <Check /> : <Link2 />} Link
          </Button>
          <Button variant="outline" onClick={() => copy(coupon.code, "code")}>
            {copied === "code" ? <Check /> : <Copy />} Código
          </Button>
        </div>
        <p className="t-caption mt-1.5">Quem abrir esse link já chega no checkout com o desconto aplicado.</p>
      </div>
    </Surface>
  );
}

function PixPanel({ pixKey }: { pixKey: string | null }) {
  const updatePix = useMyPixMutation();
  const [value, setValue] = useState(pixKey ?? "");
  const dirty = (value.trim() || null) !== pixKey;

  return (
    <Panel title="Chave PIX para recebimento">
      <p className="t-caption mb-2.5">É para essa chave que suas comissões aprovadas são pagas.</p>
      <div className="flex max-w-lg gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e-mail, CPF, telefone ou chave aleatória"
        />
        <Button onClick={() => updatePix.mutate(value.trim() || null)} loading={updatePix.isPending} disabled={!dirty}>
          Salvar
        </Button>
      </div>
    </Panel>
  );
}
