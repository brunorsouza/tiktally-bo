import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, FlaskConical, X, FileText } from "lucide-react";
import { useInvoices, useMetrics } from "@/hooks/useBoFiscal";
import { SearchInput } from "@/components/ui/input";
import { PageHeader, Money, Pagination, StatusChips } from "@/components/ds";
import { DataTable, CellStack, type Column } from "@/components/ds/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime, formatCnpj } from "@/lib/formatters";
import type { BoInvoice, InvoiceStatus } from "@/types";

type Tom = "neutral" | "success" | "warning" | "danger" | "info";

const STATUSES: { value: InvoiceStatus | ""; label: string; tone?: Tom }[] = [
  { value: "", label: "Todas" },
  { value: "authorized", label: "Autorizadas", tone: "success" },
  { value: "rejected", label: "Rejeitadas", tone: "danger" },
  { value: "processing", label: "Processando", tone: "info" },
  { value: "pending", label: "Pendentes", tone: "warning" },
  { value: "cancelled", label: "Canceladas", tone: "neutral" },
];

export function InvoicesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = searchParams.get("user") || undefined;
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  /**
   * O status mora na URL, não em `useState`.
   *
   * É o que permite o painel lateral apontar direto pra `/invoices?status=
   * rejected` — um contador que não navega obriga a refazer o filtro na mão.
   * De brinde, o filtro passa a ser compartilhável e a sobreviver ao voltar
   * do navegador.
   */
  const status = (searchParams.get("status") ?? "") as InvoiceStatus | "";
  const setStatus = (v: InvoiceStatus | "") => {
    if (v) searchParams.set("status", v);
    else searchParams.delete("status");
    setSearchParams(searchParams, { replace: true });
    setPage(1);
  };

  // Contagem por estado: o mesmo `metrics` que alimenta o painel lateral, então
  // as abas não custam uma requisição a mais.
  const { data: metrics } = useMetrics();

  const { data, isLoading, isFetching, error } = useInvoices({
    page,
    pageSize: 25,
    status: status || undefined,
    search: search || undefined,
    userId,
  });

  const clearSeller = () => {
    searchParams.delete("user");
    setSearchParams(searchParams);
    setPage(1);
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const colunas: Column<BoInvoice>[] = [
    {
      header: "Seller",
      cell: (inv) => (
        <div className="flex items-center gap-1.5">
          <CellStack
            title={inv.seller?.shop_name || inv.emitter_name || "—"}
            subtitle={formatCnpj(inv.emitter_cnpj)}
          />
          {inv.sandbox && <FlaskConical className="h-3 w-3 shrink-0 text-warning" aria-label="sandbox" />}
        </div>
      ),
    },
    {
      header: "Nº NF",
      width: "7rem",
      hideBelow: "md",
      cell: (inv) =>
        inv.nfe_number ? (
          <span className="tabular">
            {inv.nfe_number}
            {inv.nfe_series ? `/${inv.nfe_series}` : ""}
          </span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      header: "Comprador",
      width: "12rem",
      hideBelow: "lg",
      cell: (inv) => <span className="block truncate text-subtle">{inv.buyer_name || "—"}</span>,
    },
    {
      header: "Valor",
      align: "right",
      width: "8rem",
      cell: (inv) => <Money cents={Math.round((inv.total_amount ?? 0) * 100)} />,
    },
    { header: "Status", width: "8rem", cell: (inv) => <StatusBadge status={inv.status} /> },
    {
      header: "Criada",
      width: "10rem",
      hideBelow: "lg",
      cell: (inv) => <span className="tabular text-subtle">{formatDateTime(inv.created_at)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Fiscal"
        title="Notas fiscais"
        description="Todas as NF-e de todos os sellers. Clique numa linha para abrir e operar."
        meta={
          userId && (
            <button
              onClick={clearSeller}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-subtle transition-colors duration-ds ease-ds hover:text-strong"
            >
              1 seller
              <X className="h-2.5 w-2.5" />
            </button>
          )
        }
      />

      <StatusChips
        value={status}
        onChange={setStatus}
        options={STATUSES.map((s) => ({
          value: s.value,
          label: s.label,
          tone: s.tone,
          count: !metrics
            ? undefined
            : s.value === ""
              ? metrics.total
              : metrics.by_status[s.value],
        }))}
      />

      <DataTable
        toolbar={
          <form onSubmit={submitSearch} className="flex min-w-[16rem] flex-1">
            <SearchInput
              icon={<Search />}
              placeholder="Buscar por CNPJ, nº NF, pedido, comprador…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>
        }
        rows={data?.items}
        rowKey={(inv) => inv.id}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        onRowClick={(inv) => navigate(`/invoices/${inv.id}`)}
        empty={{
          title: "Nenhuma nota encontrada",
          description: search || status ? "Tente afrouxar os filtros." : "Ainda não há NF-e emitidas.",
          icon: <FileText />,
        }}
        columns={colunas}
        footer={
          data && data.items.length > 0 ? (
            <Pagination
              page={page}
              totalPages={data.totalPages}
              total={data.total}
              unit="notas"
              fetching={isFetching}
              onPage={setPage}
            />
          ) : undefined
        }
      />
    </div>
  );
}
