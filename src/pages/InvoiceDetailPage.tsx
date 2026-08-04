import { useParams } from "react-router-dom";
import { RefreshCw, RotateCw, Mail, FileDown, FileCode } from "lucide-react";
import { useInvoice, useInvoiceActions } from "@/hooks/useBoFiscal";
import { Button } from "@/components/ui/button";
import {
  BackLink,
  Panel,
  Surface,
  InfoGrid,
  Info,
  Note,
  Status,
  CodeBlock,
  ErrorState,
  Skeleton,
} from "@/components/ds";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDateTime, formatCnpj } from "@/lib/formatters";

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useInvoice(id);
  const actions = useInvoiceActions(id ?? "");

  if (isLoading)
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40" />
      </div>
    );
  if (error) return <ErrorState message={(error as Error).message} />;
  if (!data) return null;

  const { invoice: inv, seller } = data;
  const isRejected = inv.status === "rejected";
  const isAuthorized = inv.status === "authorized";

  return (
    <div className="space-y-5">
      <BackLink to="/invoices">Notas</BackLink>

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="t-display">NF-e {inv.nfe_number ? `nº ${inv.nfe_number}` : "(sem número)"}</h1>
            <StatusBadge status={inv.status} />
            {inv.sandbox && <Status tone="warning">sandbox</Status>}
          </div>
          <p className="t-caption mt-1">
            {seller?.shop_name || inv.emitter_name} · pedido <span className="font-mono">{inv.order_id}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="sm"
            loading={actions.checkStatus.isPending}
            onClick={() => actions.checkStatus.mutate()}
          >
            <RefreshCw /> Verificar status
          </Button>
          {isRejected && (
            <Button
              variant="success"
              size="sm"
              loading={actions.reprocess.isPending}
              onClick={() => actions.reprocess.mutate()}
            >
              <RotateCw /> Reprocessar
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
                <FileDown /> DANFE
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={actions.openDocument.isPending && actions.openDocument.variables === "xml"}
                onClick={() => actions.openDocument.mutate("xml")}
              >
                <FileCode /> XML
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={actions.resendEmail.isPending}
                onClick={() => actions.resendEmail.mutate()}
              >
                <Mail /> Reenviar e-mail
              </Button>
            </>
          )}
        </div>
      </header>

      {isRejected && inv.error_message && (
        <Note tone="warning" className="border-l-danger">
          <p className="t-overline text-danger">Motivo da rejeição</p>
          <p className="mt-1 text-[0.8125rem] text-strong">{inv.error_message}</p>
        </Note>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Surface className="p-4">
          <p className="t-label mb-4">Nota</p>
          <InfoGrid cols={2}>
            <Info label="Tipo" value={inv.invoice_type?.toUpperCase()} />
            <Info label="Valor total" value={formatCurrency(inv.total_amount)} />
            <Info label="Nº / Série" value={inv.nfe_number ? `${inv.nfe_number}/${inv.nfe_series ?? "1"}` : "—"} />
            <Info label="Chave de acesso" value={<span className="font-mono">{inv.nfe_key || "—"}</span>} />
            <Info label="ICMS" value={formatCurrency(inv.tax_icms)} />
            <Info
              label="PIS / COFINS"
              value={`${formatCurrency(inv.tax_pis)} / ${formatCurrency(inv.tax_cofins)}`}
            />
            <Info label="Emitida em" value={formatDateTime(inv.issued_at)} />
            <Info label="Criada em" value={formatDateTime(inv.created_at)} />
          </InfoGrid>
        </Surface>

        <Surface className="p-4">
          <p className="t-label mb-4">Emitente & comprador</p>
          <InfoGrid cols={2}>
            <Info label="Seller" value={seller?.shop_name || "—"} />
            <Info label="E-mail do seller" value={seller?.email || "—"} />
            <Info label="Razão social" value={seller?.razao_social || inv.emitter_name} />
            <Info label="CNPJ emitente" value={<span className="font-mono">{formatCnpj(inv.emitter_cnpj)}</span>} />
            <Info label="Comprador" value={inv.buyer_name} />
            <Info
              label="CPF/CNPJ comprador"
              value={<span className="font-mono">{formatCnpj(inv.buyer_cpf_cnpj)}</span>}
            />
            <Info label="Regime" value={seller?.regime_tributario || "—"} />
            <Info
              label="Spedy invoice ID"
              value={<span className="font-mono">{inv.spedy_invoice_id || inv.spedy_order_id || "—"}</span>}
            />
          </InfoGrid>
        </Surface>
      </div>

      <Panel title="Itens">
        <CodeBlock value={inv.items} maxHeight="16rem" />
      </Panel>

      <Panel title="Resposta bruta da Spedy">
        <CodeBlock value={inv.spedy_response} />
      </Panel>
    </div>
  );
}
