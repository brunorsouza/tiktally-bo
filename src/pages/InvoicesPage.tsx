import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, FlaskConical, X } from "lucide-react";
import { useInvoices } from "@/hooks/useBoFiscal";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { CenteredSpinner } from "@/components/ui/spinner";
import { formatCurrency, formatDateTime, formatCnpj } from "@/lib/formatters";
import type { InvoiceStatus } from "@/types";

const STATUSES: { value: InvoiceStatus | ""; label: string }[] = [
  { value: "", label: "Todos os status" },
  { value: "authorized", label: "Autorizadas" },
  { value: "rejected", label: "Rejeitadas" },
  { value: "processing", label: "Processando" },
  { value: "pending", label: "Pendentes" },
  { value: "cancelled", label: "Canceladas" },
];

export function InvoicesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = searchParams.get("user") || undefined;
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [page, setPage] = useState(1);

  const filters = {
    page,
    pageSize: 25,
    status: status || undefined,
    search: search || undefined,
    userId,
  };

  const clearSeller = () => {
    searchParams.delete("user");
    setSearchParams(searchParams);
    setPage(1);
  };
  const { data, isLoading, isFetching, error } = useInvoices(filters);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Notas fiscais</h1>
        <p className="text-sm text-muted-foreground">
          Todas as NF-e de todos os sellers. Clique numa linha para abrir e operar.
        </p>
        {userId && (
          <button
            onClick={clearSeller}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs hover:bg-muted/60"
          >
            Filtrando por 1 seller
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-5">
          <form onSubmit={submitSearch} className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por CNPJ, nº NF, pedido, comprador…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>
          <Select
            className="w-48"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as InvoiceStatus | "");
              setPage(1);
            }}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button variant="outline" onClick={submitSearch}>
            Filtrar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <CenteredSpinner label="Carregando notas…" />
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">
              {(error as Error).message}
            </p>
          ) : !data || data.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma nota encontrada.</p>
          ) : (
            <>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Seller</TH>
                    <TH>Emitente (CNPJ)</TH>
                    <TH>Nº NF</TH>
                    <TH>Comprador</TH>
                    <TH className="text-right">Valor</TH>
                    <TH>Status</TH>
                    <TH>Criada</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.items.map((inv) => (
                    <TR
                      key={inv.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                    >
                      <TD>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">
                            {inv.seller?.shop_name || inv.emitter_name || "—"}
                          </span>
                          {inv.sandbox && (
                            <FlaskConical className="h-3.5 w-3.5 text-warning" aria-label="sandbox" />
                          )}
                        </div>
                      </TD>
                      <TD className="text-muted-foreground">{formatCnpj(inv.emitter_cnpj)}</TD>
                      <TD>
                        {inv.nfe_number ? (
                          <span className="tabular-nums">
                            {inv.nfe_number}
                            {inv.nfe_series ? `/${inv.nfe_series}` : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD className="max-w-[160px] truncate">{inv.buyer_name || "—"}</TD>
                      <TD className="text-right tabular-nums">{formatCurrency(inv.total_amount)}</TD>
                      <TD>
                        <StatusBadge status={inv.status} />
                      </TD>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(inv.created_at)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>

              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {data.total} nota(s){" "}
                  {isFetching && <Badge tone="muted" className="ml-1">atualizando…</Badge>}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
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
