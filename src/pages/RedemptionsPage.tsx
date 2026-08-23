import { useState } from "react";
import { Download, Gift } from "lucide-react";
import { useRedemptions } from "@/hooks/useBoCoupons";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader, Status, Money, Pagination } from "@/components/ds";
import { DataTable, type Column } from "@/components/ds/DataTable";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/formatters";
import type { CouponRedemption } from "@/types";

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

  const colunas: Column<CouponRedemption>[] = [
    {
      header: "Data",
      width: "11rem",
      cell: (r) => <span className="tabular text-subtle">{formatDateTime(r.redeemed_at)}</span>,
    },
    { header: "Cupom", width: "9rem", cell: (r) => <span className="font-mono text-strong">{r.coupon_code ?? "—"}</span> },
    {
      header: "Tipo",
      width: "7rem",
      cell: (r) => (r.billing_id ? <Status tone="info">Compra</Status> : <Status tone="neutral">Trial</Status>),
    },
    { header: "Usuário", cell: (r) => <span className="text-subtle">{r.user_email ?? r.user_id}</span> },
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
      <PageHeader
        eyebrow="Cupons"
        title="Resgates"
        description="Histórico de uso dos cupons — descontos em compras e trials concedidos."
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <Download /> Exportar CSV
          </Button>
        }
      />

      <DataTable
        toolbar={
          <>
            <Input
              inputSize="sm"
              type="date"
              aria-label="Data inicial"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="w-40"
            />
            <span className="t-caption">até</span>
            <Input
              inputSize="sm"
              type="date"
              aria-label="Data final"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="w-40"
            />
            <Select
              selectSize="sm"
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
          </>
        }
        rows={data?.items}
        rowKey={(r) => r.id}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        empty={{
          title: "Nenhum resgate",
          description: "Assim que um cupom for usado no checkout, o registro aparece aqui.",
          icon: <Gift />,
        }}
        columns={colunas}
        footer={
          data && data.items.length > 0 ? (
            <Pagination
              page={page}
              totalPages={data.totalPages}
              total={data.total}
              unit="resgates"
              fetching={isFetching}
              onPage={setPage}
            />
          ) : undefined
        }
      />
    </div>
  );
}
