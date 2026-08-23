import { useState } from "react";
import { Coins } from "lucide-react";
import { useCommissions, useCommissionMutations } from "@/hooks/useBoCoupons";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader, Toolbar, Field, Note, Money } from "@/components/ds";
import { DataTable, CellStack, RowActions, type Column } from "@/components/ds/DataTable";
import { CommissionStatusBadge } from "@/components/CouponBadges";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Commission, CommissionFilters } from "@/types";

const STATUS_FILTERS = [
  { value: "", label: "Todas" },
  { value: "pending", label: "Pendentes" },
  { value: "eligible", label: "Elegíveis" },
  { value: "approved", label: "Aprovadas" },
  { value: "paid", label: "Pagas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "reversed", label: "Estornadas" },
] as const;


function ruleLabel(c: Commission): string {
  return c.commission_type === "fixed" ? formatCurrency(c.commission_value / 100) : `${c.commission_value}%`;
}

export function CommissionsPage() {
  const [status, setStatus] = useState<NonNullable<CommissionFilters["status"]> | "">("");
  const [payTarget, setPayTarget] = useState<Commission | null>(null);
  const [reverseTarget, setReverseTarget] = useState<Commission | null>(null);
  const { data, isLoading, error } = useCommissions({ status: status || undefined });
  const { approve } = useCommissionMutations();

  const colunas: Column<Commission>[] = [
    {
      header: "Afiliado",
      cell: (c) => (
        <CellStack
          title={c.affiliate_name ?? "—"}
          subtitle={c.affiliate_pix_key ? `PIX ${c.affiliate_pix_key}` : undefined}
        />
      ),
    },
    {
      header: "Valor",
      align: "right",
      width: "8rem",
      cell: (c) => <Money cents={c.amount_cents} className="font-medium text-strong" />,
    },
    { header: "Regra", width: "6rem", hideBelow: "md", cell: (c) => <span className="tabular text-subtle">{ruleLabel(c)}</span> },
    { header: "Status", width: "8rem", cell: (c) => <CommissionStatusBadge status={c.status} /> },
    {
      header: "Elegível",
      width: "7rem",
      hideBelow: "lg",
      cell: (c) =>
        c.status !== "pending" ? (
          <span className="text-subtle">—</span>
        ) : c.eligible ? (
          <span className="text-success">agora</span>
        ) : (
          <span className="tabular text-subtle">{formatDate(c.eligible_at)}</span>
        ),
    },
    {
      header: "",
      align: "right",
      width: "12rem",
      cell: (c) => (
        <RowActions>
          {c.status === "pending" && c.eligible && (
            <Button variant="ghost" size="sm" onClick={() => approve.mutate(c.id)} loading={approve.isPending}>
              Aprovar
            </Button>
          )}
          {c.status === "approved" && (
            <Button variant="ghost" size="sm" onClick={() => setPayTarget(c)}>
              Pagar
            </Button>
          )}
          {(c.status === "approved" || c.status === "paid") && (
            <Button variant="ghost" size="sm" onClick={() => setReverseTarget(c)}>
              Estornar
            </Button>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Afiliados"
        title="Comissões"
        meta={data && <span className="t-overline">{data.items.length}</span>}
        description="Geradas no 1º pagamento. Ficam elegíveis após a janela de 7 dias (refund). Fluxo: aprovar → pagar → (estornar)."
      />

      <Toolbar>
        <Select
          selectSize="sm"
          className="w-48"
          value={status}
          onChange={(e) => setStatus(e.target.value as NonNullable<CommissionFilters["status"]> | "")}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Toolbar>

      <DataTable
        rows={data?.items}
        rowKey={(c) => c.id}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        empty={{
          title: "Nenhuma comissão",
          description: status
            ? "Nenhuma comissão nesse status."
            : "Comissões aparecem aqui quando um cupom de afiliado gera o primeiro pagamento.",
          icon: <Coins />,
        }}
        columns={colunas}
      />

      {payTarget && <PayDialog commission={payTarget} onClose={() => setPayTarget(null)} />}
      {reverseTarget && <ReverseDialog commission={reverseTarget} onClose={() => setReverseTarget(null)} />}
    </div>
  );
}

function PayDialog({ commission, onClose }: { commission: Commission; onClose: () => void }) {
  const { pay } = useCommissionMutations();
  const [reference, setReference] = useState("");

  return (
    <Dialog
      open
      onClose={onClose}
      title="Pagar comissão"
      description={commission.affiliate_name ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pay.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              pay.mutate({ id: commission.id, paymentReference: reference || undefined }, { onSuccess: onClose })
            }
            loading={pay.isPending}
          >
            Confirmar pagamento
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* O valor é a informação que decide o clique — vem grande, não numa frase */}
        <div className="border-l-2 border-brand pl-3.5">
          <p className="t-overline">A pagar</p>
          <p className="t-metric mt-1.5">
            <Money cents={commission.amount_cents} />
          </p>
          {commission.affiliate_pix_key && (
            <p className="t-caption mt-1.5 font-mono">PIX {commission.affiliate_pix_key}</p>
          )}
        </div>

        <Field label="Referência do pagamento" hint="Id da transferência ou comprovante — fica na auditoria.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="E2E, comprovante…" />
        </Field>
      </div>
    </Dialog>
  );
}

function ReverseDialog({ commission, onClose }: { commission: Commission; onClose: () => void }) {
  const { reverse } = useCommissionMutations();
  const [reason, setReason] = useState("");

  return (
    <Dialog
      open
      onClose={onClose}
      title="Estornar comissão"
      description={commission.affiliate_name ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={reverse.isPending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => reverse.mutate({ id: commission.id, reason: reason.trim() }, { onSuccess: onClose })}
            loading={reverse.isPending}
            disabled={reason.trim().length < 3}
          >
            Estornar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Note tone="warning">
          Use em chargeback/reembolso do 1º pagamento depois que a comissão já foi aprovada ou paga.
          Fica registrado em auditoria.
        </Note>

        <Field label="Motivo do estorno" hint="Mínimo de 3 caracteres.">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: chargeback do 1º pagamento"
          />
        </Field>
      </div>
    </Dialog>
  );
}
