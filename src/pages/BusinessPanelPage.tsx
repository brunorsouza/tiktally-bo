import { useAffiliates, useCommissions, useMe } from "@/hooks/useBoCoupons";
import { PageHeader, Panel, Stat, StatGrid, Money, Status } from "@/components/ds";
import { DataTable, CellStack, type Column } from "@/components/ds/DataTable";
import { CommissionStatusBadge } from "@/components/CouponBadges";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Affiliate, Commission } from "@/types";

const sumCents = (rows: Commission[], pred: (c: Commission) => boolean) =>
  rows.filter(pred).reduce((a, c) => a + c.amount_cents, 0);

/**
 * Painel da carteira (Business) e do próprio afiliado. Somente leitura: o
 * gateway resolve o papel e FORÇA o filtro por business_id/affiliate_id —
 * o front nunca escolhe escopo.
 */
export function BusinessPanelPage() {
  const { data: me } = useMe();
  const isAffiliate = me?.role === "affiliate";

  const { data: affData, isLoading: affLoading } = useAffiliates();
  const { data: comData, isLoading: comLoading, error } = useCommissions();

  const commissions = comData?.items ?? [];
  const pending = sumCents(commissions, (c) => c.status === "pending" || c.status === "approved");
  const paid = sumCents(commissions, (c) => c.status === "paid");

  const colunasAfiliados: Column<Affiliate>[] = [
    { header: "Afiliado", cell: (a) => <CellStack title={a.name} subtitle={a.email ?? undefined} /> },
    {
      header: "Comissão",
      align: "right",
      width: "8rem",
      cell: (a) => (
        <span className="tabular">
          {a.default_commission_type === "fixed"
            ? formatCurrency(a.default_commission_value / 100)
            : `${a.default_commission_value}%`}
        </span>
      ),
    },
    {
      header: "Status",
      width: "7rem",
      cell: (a) =>
        a.status === "active" ? (
          <Status tone="success">Ativo</Status>
        ) : (
          <Status tone="neutral">Suspenso</Status>
        ),
    },
  ];

  const colunasComissoes: Column<Commission>[] = [
    ...(isAffiliate
      ? []
      : [{ header: "Afiliado", cell: (c: Commission) => c.affiliate_name ?? "—" } as Column<Commission>]),
    {
      header: "Valor",
      align: "right",
      width: "8rem",
      cell: (c) => <Money cents={c.amount_cents} className="font-medium text-strong" />,
    },
    { header: "Status", width: "8rem", cell: (c) => <CommissionStatusBadge status={c.status} /> },
    {
      header: "Elegível em",
      width: "8rem",
      hideBelow: "md",
      cell: (c) => <span className="tabular text-subtle">{formatDate(c.eligible_at)}</span>,
    },
    {
      header: "Pago em",
      width: "8rem",
      hideBelow: "md",
      cell: (c) => <span className="tabular text-subtle">{formatDate(c.paid_at)}</span>,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={isAffiliate ? "Meu programa" : "Minha carteira"}
        title={isAffiliate ? "Minhas comissões" : "Minha carteira"}
        description={`${me?.scope_name ? `${me.scope_name} · ` : ""}${
          isAffiliate ? "Comissões geradas pelo seu cupom." : "Afiliados e comissões da sua carteira."
        }`}
      />

      <StatGrid cols={3}>
        <Stat label="A receber" value={<Money cents={pending} />} hint="pendentes + aprovadas" tone="brand" />
        <Stat label="Já pago" value={<Money cents={paid} />} hint="comissões pagas" tone="success" />
        <Stat
          label={isAffiliate ? "Comissões" : "Afiliados"}
          value={isAffiliate ? commissions.length : affData?.total ?? 0}
          hint={isAffiliate ? "no total" : "na carteira"}
        />
      </StatGrid>

      {!isAffiliate && (
        <Panel title="Afiliados da carteira">
          <DataTable
            rows={affData?.items}
            rowKey={(a) => a.id}
            loading={affLoading}
            empty={{
              title: "Nenhum afiliado na carteira",
              description: "O admin da TikTally cadastra os afiliados vinculados a você.",
            }}
            columns={colunasAfiliados}
          />
        </Panel>
      )}

      <Panel title="Comissões">
        <DataTable
          rows={commissions}
          rowKey={(c) => c.id}
          loading={comLoading}
          error={error ? (error as Error).message : null}
          empty={{
            title: "Nenhuma comissão ainda",
            description: "Elas aparecem quando um cliente assina usando o cupom.",
          }}
          columns={colunasComissoes}
        />
      </Panel>
    </div>
  );
}
