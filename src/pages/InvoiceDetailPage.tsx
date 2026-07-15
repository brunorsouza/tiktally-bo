import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  RefreshCw,
  RotateCw,
  Mail,
  FileDown,
  FileCode,
  FlaskConical,
} from "lucide-react";
import { useInvoice, useInvoiceActions } from "@/hooks/useBoFiscal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { CenteredSpinner } from "@/components/ui/spinner";
import { formatCurrency, formatDateTime, formatCnpj } from "@/lib/formatters";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words text-sm">{value ?? "—"}</p>
    </div>
  );
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useInvoice(id);
  const actions = useInvoiceActions(id ?? "");

  if (isLoading) return <CenteredSpinner label="Carregando nota…" />;
  if (error)
    return <p className="text-sm text-destructive">Erro: {(error as Error).message}</p>;
  if (!data) return null;

  const { invoice: inv, seller } = data;
  const isRejected = inv.status === "rejected";
  const isAuthorized = inv.status === "authorized";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/invoices">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">
                NF-e {inv.nfe_number ? `nº ${inv.nfe_number}` : "(sem número)"}
              </h1>
              <StatusBadge status={inv.status} />
              {inv.sandbox && (
                <Badge tone="warning" className="gap-1">
                  <FlaskConical className="h-3 w-3" /> sandbox
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {seller?.shop_name || inv.emitter_name} · pedido {inv.order_id}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={actions.checkStatus.isPending}
            onClick={() => actions.checkStatus.mutate()}
          >
            <RefreshCw className="h-4 w-4" /> Verificar status
          </Button>
          {isRejected && (
            <Button
              variant="success"
              size="sm"
              loading={actions.reprocess.isPending}
              onClick={() => actions.reprocess.mutate()}
            >
              <RotateCw className="h-4 w-4" /> Reprocessar
            </Button>
          )}
          {isAuthorized && (
            <>
              <Button
                variant="outline"
                size="sm"
                loading={actions.openDocument.isPending && actions.openDocument.variables === "pdf"}
                onClick={() => actions.openDocument.mutate("pdf")}
              >
                <FileDown className="h-4 w-4" /> DANFE
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={actions.openDocument.isPending && actions.openDocument.variables === "xml"}
                onClick={() => actions.openDocument.mutate("xml")}
              >
                <FileCode className="h-4 w-4" /> XML
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={actions.resendEmail.isPending}
                onClick={() => actions.resendEmail.mutate()}
              >
                <Mail className="h-4 w-4" /> Reenviar e-mail
              </Button>
            </>
          )}
        </div>
      </div>

      {isRejected && inv.error_message && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
              Motivo da rejeição
            </p>
            <p className="mt-1 text-sm">{inv.error_message}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nota</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Field label="Tipo" value={inv.invoice_type?.toUpperCase()} />
            <Field label="Valor total" value={formatCurrency(inv.total_amount)} />
            <Field label="Nº / Série" value={inv.nfe_number ? `${inv.nfe_number}/${inv.nfe_series ?? "1"}` : "—"} />
            <Field label="Chave de acesso" value={inv.nfe_key || "—"} />
            <Field label="ICMS" value={formatCurrency(inv.tax_icms)} />
            <Field label="PIS / COFINS" value={`${formatCurrency(inv.tax_pis)} / ${formatCurrency(inv.tax_cofins)}`} />
            <Field label="Emitida em" value={formatDateTime(inv.issued_at)} />
            <Field label="Criada em" value={formatDateTime(inv.created_at)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emitente & comprador</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Field label="Seller" value={seller?.shop_name || "—"} />
            <Field label="E-mail do seller" value={seller?.email || "—"} />
            <Field label="Razão social" value={seller?.razao_social || inv.emitter_name} />
            <Field label="CNPJ emitente" value={formatCnpj(inv.emitter_cnpj)} />
            <Field label="Comprador" value={inv.buyer_name} />
            <Field label="CPF/CNPJ comprador" value={formatCnpj(inv.buyer_cpf_cnpj)} />
            <Field label="Regime" value={seller?.regime_tributario || "—"} />
            <Field label="Spedy invoice ID" value={inv.spedy_invoice_id || inv.spedy_order_id || "—"} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Itens</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(inv.items, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resposta bruta da Spedy</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(inv.spedy_response, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
