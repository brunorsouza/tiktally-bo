import { useState } from "react";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import { useRedemptions } from "@/hooks/useBoCoupons";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CenteredSpinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/formatters";

const TYPE_FILTERS = [
  { value: "", label: "Todos os tipos" },
  { value: "discount", label: "Descontos (compra)" },
  { value: "trial", label: "Trials (teste grátis)" },
];

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export function RedemptionsPage() {
  const toast = useToast();
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, error } = useRedemptions({
    onlyTrial: type === "trial" || undefined,
    onlyDiscount: type === "discount" || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
    page,
    pageSize: 50,
  });

  const exportCsv = () => {
    const items = data?.items ?? [];
    if (!items.length) {
      toast.error("Nada para exportar");
      return;
    }
    const csv = toCsv(
      items.map((r) => ({
        data: formatDateTime(r.redeemed_at),
        cupom: r.coupon_code ?? "",
        tipo: r.billing_id ? "compra" : "trial",
        usuario: r.user_email ?? r.user_id,
        desconto: r.discount_cents > 0 ? (r.discount_cents / 100).toFixed(2) : "",
      }))
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resgates-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado", `${items.length} linha(s)`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Resgates</h1>
        <p className="text-sm text-muted-foreground">
          Histórico de uso dos cupons — descontos em compras e trials concedidos.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <label className="text-xs text-muted-foreground">
            De
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-40" />
          </label>
          <label className="text-xs text-muted-foreground">
            Até
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-40" />
          </label>
          <Select
            className="w-52"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            {TYPE_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <div className="ml-auto">
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <CenteredSpinner label="Carregando resgates…" />
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>
          ) : !data || data.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum resgate encontrado.</p>
          ) : (
            <>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Data</TH>
                    <TH>Cupom</TH>
                    <TH>Tipo</TH>
                    <TH>Usuário</TH>
                    <TH className="text-right">Desconto</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.items.map((r) => (
                    <TR key={r.id} className="hover:bg-transparent">
                      <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.redeemed_at)}</TD>
                      <TD className="font-mono">{r.coupon_code ?? "—"}</TD>
                      <TD>
                        {r.billing_id ? <Badge tone="info">Compra</Badge> : <Badge tone="default">Trial</Badge>}
                      </TD>
                      <TD className="text-xs">{r.user_email ?? r.user_id}</TD>
                      <TD className="text-right tabular-nums">
                        {r.discount_cents > 0 ? formatCurrency(r.discount_cents / 100) : "—"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>

              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {data.total} resgate(s){" "}
                  {isFetching && <Badge tone="muted" className="ml-1">atualizando…</Badge>}
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span>
                    {page} / {data.totalPages || 1}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= (data.totalPages || 1)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
