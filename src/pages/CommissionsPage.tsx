import { useState } from "react";
import { useCommissions, useCommissionMutations } from "@/hooks/useBoCoupons";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CenteredSpinner } from "@/components/ui/spinner";
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

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  approved: { label: "Aprovada", cls: "bg-primary/15 text-primary" },
  paid: { label: "Paga", cls: "bg-success/15 text-success" },
  cancelled: { label: "Cancelada", cls: "bg-muted text-muted-foreground" },
  reversed: { label: "Estornada", cls: "bg-destructive/15 text-destructive" },
};

function ruleLabel(c: Commission): string {
  return c.commission_type === "fixed" ? formatCurrency(c.commission_value / 100) : `${c.commission_value}%`;
}

export function CommissionsPage() {
  const [status, setStatus] = useState<NonNullable<CommissionFilters["status"]> | "">("");
  const [payTarget, setPayTarget] = useState<Commission | null>(null);
  const [reverseTarget, setReverseTarget] = useState<Commission | null>(null);
  const { data, isLoading, error } = useCommissions({ status: status || undefined });
  const { approve } = useCommissionMutations();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Comissões</h1>
        <p className="text-sm text-muted-foreground">
          Geradas no 1º pagamento. Ficam elegíveis após a janela de 7 dias (refund). Fluxo: aprovar → pagar → (estornar).
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-3 pt-5">
          <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value as NonNullable<CommissionFilters["status"]> | "")}>
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <CenteredSpinner label="Carregando comissões…" />
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>
          ) : !data || data.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma comissão encontrada.</p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Afiliado</TH>
                  <TH className="text-right">Valor</TH>
                  <TH>Regra</TH>
                  <TH>Status</TH>
                  <TH>Elegível</TH>
                  <TH className="text-right">Ações</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((c) => {
                  const meta = STATUS_META[c.status] ?? { label: c.status, cls: "bg-muted text-muted-foreground" };
                  return (
                    <TR key={c.id}>
                      <TD>
                        <span className="font-medium">{c.affiliate_name ?? "—"}</span>
                        {c.affiliate_pix_key && <span className="block text-xs text-muted-foreground">PIX: {c.affiliate_pix_key}</span>}
                      </TD>
                      <TD className="text-right font-medium tabular-nums">{formatCurrency(c.amount_cents / 100)}</TD>
                      <TD className="text-muted-foreground">{ruleLabel(c)}</TD>
                      <TD>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                      </TD>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {c.status === "pending" ? c.eligible ? <span className="text-success">agora</span> : formatDate(c.eligible_at) : "—"}
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
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
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {payTarget && <PayDialog commission={payTarget} onClose={() => setPayTarget(null)} />}
      {reverseTarget && <ReverseDialog commission={reverseTarget} onClose={() => setReverseTarget(null)} />}
    </div>
  );
}

function PayDialog({ commission, onClose }: { commission: Commission; onClose: () => void }) {
  const { pay } = useCommissionMutations();
  const [reference, setReference] = useState("");
  return (
    <Dialog open onClose={onClose} title={`Pagar comissão — ${commission.affiliate_name ?? ""}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Valor: <span className="font-medium text-foreground">{formatCurrency(commission.amount_cents / 100)}</span>
          {commission.affiliate_pix_key && <> · PIX: {commission.affiliate_pix_key}</>}
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Referência do pagamento (id da transferência / comprovante)</span>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="E2E, comprovante…" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={pay.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => pay.mutate({ id: commission.id, paymentReference: reference || undefined }, { onSuccess: onClose })} loading={pay.isPending}>
            Confirmar pagamento
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ReverseDialog({ commission, onClose }: { commission: Commission; onClose: () => void }) {
  const { reverse } = useCommissionMutations();
  const [reason, setReason] = useState("");
  return (
    <Dialog open onClose={onClose} title={`Estornar comissão — ${commission.affiliate_name ?? ""}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Use em chargeback/reembolso do 1º pagamento após a comissão ter sido aprovada/paga. Fica registrado em auditoria.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Motivo do estorno</span>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: chargeback do 1º pagamento" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={reverse.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => reverse.mutate({ id: commission.id, reason: reason.trim() }, { onSuccess: onClose })}
            loading={reverse.isPending}
            disabled={reason.trim().length < 3}
          >
            Estornar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
