import { useAffiliates, useCommissions, useMe } from "@/hooks/useBoCoupons";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CenteredSpinner } from "@/components/ui/spinner";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Commission } from "@/types";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  approved: { label: "Aprovada", cls: "bg-primary/15 text-primary" },
  paid: { label: "Paga", cls: "bg-success/15 text-success" },
  cancelled: { label: "Cancelada", cls: "bg-muted text-muted-foreground" },
  reversed: { label: "Estornada", cls: "bg-destructive/15 text-destructive" },
};

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">
          {isAffiliate ? "Minhas comissões" : "Minha carteira"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {me?.scope_name ? `${me.scope_name} · ` : ""}
          {isAffiliate
            ? "Comissões geradas pelo seu cupom."
            : "Afiliados e comissões da sua carteira."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="A receber" value={formatCurrency(pending / 100)} hint="pendentes + aprovadas" />
        <StatCard label="Já pago" value={formatCurrency(paid / 100)} hint="comissões pagas" />
        <StatCard
          label={isAffiliate ? "Comissões" : "Afiliados"}
          value={String(isAffiliate ? commissions.length : affData?.total ?? 0)}
          hint={isAffiliate ? "no total" : "na carteira"}
        />
      </div>

      {!isAffiliate && (
        <Card>
          <CardContent className="pt-5">
            <p className="mb-3 text-sm font-medium">Afiliados da carteira</p>
            {affLoading ? (
              <CenteredSpinner label="Carregando afiliados…" />
            ) : !affData || affData.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum afiliado na carteira ainda. O admin da TikTally cadastra os afiliados.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Nome</TH>
                    <TH>E-mail</TH>
                    <TH className="text-right">Comissão</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {affData.items.map((a) => (
                    <TR key={a.id}>
                      <TD className="font-medium">{a.name}</TD>
                      <TD className="text-muted-foreground">{a.email ?? "—"}</TD>
                      <TD className="text-right tabular-nums">
                        {a.default_commission_type === "fixed"
                          ? formatCurrency(a.default_commission_value / 100)
                          : `${a.default_commission_value}%`}
                      </TD>
                      <TD className="text-muted-foreground">
                        {a.status === "active" ? "Ativo" : "Suspenso"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <p className="mb-3 text-sm font-medium">Comissões</p>
          {comLoading ? (
            <CenteredSpinner label="Carregando comissões…" />
          ) : error ? (
            <p className="py-6 text-center text-sm text-destructive">{(error as Error).message}</p>
          ) : commissions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma comissão ainda. Elas aparecem quando um cliente assina usando o cupom.
            </p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  {!isAffiliate && <TH>Afiliado</TH>}
                  <TH className="text-right">Valor</TH>
                  <TH>Status</TH>
                  <TH>Elegível em</TH>
                  <TH>Pago em</TH>
                </TR>
              </THead>
              <TBody>
                {commissions.map((c) => {
                  const meta = STATUS_META[c.status] ?? { label: c.status, cls: "bg-muted text-muted-foreground" };
                  return (
                    <TR key={c.id}>
                      {!isAffiliate && <TD className="font-medium">{c.affiliate_name ?? "—"}</TD>}
                      <TD className="text-right font-medium tabular-nums">{formatCurrency(c.amount_cents / 100)}</TD>
                      <TD>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                      </TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{formatDate(c.eligible_at)}</TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{formatDate(c.paid_at)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
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
