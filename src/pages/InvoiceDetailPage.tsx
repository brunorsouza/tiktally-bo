import { useState } from "react";
import { useParams } from "react-router-dom";
import { RefreshCw, RotateCw, Mail, FileDown, FileCode, Ban } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { useInvoice, useInvoiceActions } from "@/hooks/useBoFiscal";
import { Button } from "@/components/ui/button";
import {
  BackLink,
  PageHeader,
  Field,
  Panel,
  Fieldset,
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
  const [cancelando, setCancelando] = useState(false);

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
    <div className="space-y-6">
      <BackLink to="/invoices">Notas</BackLink>

      <PageHeader
        title={`NF-e ${inv.nfe_number ? `nº ${inv.nfe_number}` : "(sem número)"}`}
        meta={
          <>
            <StatusBadge status={inv.status} />
            {inv.sandbox && <Status tone="warning">sandbox</Status>}
          </>
        }
        description={
          <>
            {seller?.shop_name || inv.emitter_name} · pedido{" "}
            <span className="tabular">{inv.order_id}</span>
          </>
        }
        actions={
          <>
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
              {/* Cancelar é destrutivo e tem prazo legal: fica por último e em
                  `danger`, longe do DANFE, que é o botão vizinho mais clicado. */}
              <Button variant="danger" size="sm" onClick={() => setCancelando(true)}>
                <Ban /> Cancelar NF-e
              </Button>
            </>
          )}
          </>
        }
      />

      {cancelando && (
        <CancelarNfe
          numero={inv.nfe_number}
          emitidaEm={inv.issued_at}
          pendente={actions.cancelInvoice.isPending}
          onClose={() => setCancelando(false)}
          onConfirm={(reason) =>
            actions.cancelInvoice.mutate(reason, { onSuccess: () => setCancelando(false) })
          }
        />
      )}

      {inv.status === "cancelled" && inv.cancel_reason && (
        <Note tone="warning">
          <p className="t-overline">Justificativa do cancelamento</p>
          <p className="mt-1 text-[0.8125rem] text-strong">{inv.cancel_reason}</p>
        </Note>
      )}

      {isRejected && inv.error_message && (
        <Note tone="warning" className="border-l-danger">
          <p className="t-overline text-danger">Motivo da rejeição</p>
          <p className="mt-1 text-[0.8125rem] text-strong">{inv.error_message}</p>
        </Note>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Fieldset title="Nota">
          <InfoGrid cols={2}>
            <Info label="Tipo" value={inv.invoice_type?.toUpperCase()} />
            <Info label="Valor total" value={formatCurrency(inv.total_amount)} mono />
            <Info
              label="Nº / Série"
              value={inv.nfe_number ? `${inv.nfe_number}/${inv.nfe_series ?? "1"}` : "—"}
              mono
            />
            <Info label="Chave de acesso" value={inv.nfe_key || "—"} mono />
            <Info label="ICMS" value={formatCurrency(inv.tax_icms)} mono />
            <Info
              label="PIS / COFINS"
              value={`${formatCurrency(inv.tax_pis)} / ${formatCurrency(inv.tax_cofins)}`}
              mono
            />
            <Info label="Emitida em" value={formatDateTime(inv.issued_at)} mono />
            <Info label="Criada em" value={formatDateTime(inv.created_at)} mono />
          </InfoGrid>
        </Fieldset>

        <Fieldset title="Emitente & comprador">
          <InfoGrid cols={2}>
            <Info label="Seller" value={seller?.shop_name || "—"} />
            <Info label="E-mail do seller" value={seller?.email || "—"} />
            <Info label="Razão social" value={seller?.razao_social || inv.emitter_name} />
            <Info label="CNPJ emitente" value={formatCnpj(inv.emitter_cnpj)} mono />
            <Info label="Comprador" value={inv.buyer_name} />
            <Info label="CPF/CNPJ comprador" value={formatCnpj(inv.buyer_cpf_cnpj)} mono />
            <Info label="Regime" value={seller?.regime_tributario || "—"} />
            <Info
              label="Spedy invoice ID"
              value={inv.spedy_invoice_id || inv.spedy_order_id || "—"}
              mono
            />
          </InfoGrid>
        </Fieldset>
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

/** Mínimo da SEFAZ para o campo `xJust` do evento de cancelamento. */
const JUSTIFICATIVA_MIN = 15;
const JUSTIFICATIVA_MAX = 255;

/**
 * Confirmação do cancelamento, com a justificativa que vai pra SEFAZ.
 *
 * O contador de caracteres é obrigatório aqui, não enfeite: abaixo de 15 a
 * SEFAZ recusa o evento, e essa recusa chega assíncrona, minutos depois, longe
 * de quem escreveu. Melhor barrar com o número na frente.
 */
function CancelarNfe({
  numero,
  emitidaEm,
  pendente,
  onConfirm,
  onClose,
}: {
  numero: string | null;
  emitidaEm: string | null;
  pendente: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const texto = reason.trim();
  const curto = texto.length < JUSTIFICATIVA_MIN;
  const longo = texto.length > JUSTIFICATIVA_MAX;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Cancelar NF-e ${numero ? `nº ${numero}` : ""}`}
      className="max-w-[32rem]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pendente}>
            Voltar
          </Button>
          <Button
            variant="danger"
            loading={pendente}
            disabled={curto || longo}
            onClick={() => onConfirm(texto)}
          >
            Cancelar NF-e
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="t-body leading-relaxed">
          O cancelamento é registrado na SEFAZ e a justificativa fica no evento, junto da nota.
          Depois de confirmado não há como desfazer: a numeração continua consumida e uma nova venda
          exige uma nova nota.
        </p>
        <Note tone="warning">
          O prazo legal varia por estado, e costuma ser curto{" "}
          {emitidaEm ? `(esta foi emitida em ${formatDateTime(emitidaEm)})` : ""}. Fora do prazo, a
          SEFAZ recusa e o caminho passa a ser nota de devolução.
        </Note>
        <Field
          label="Justificativa"
          hint={
            longo
              ? `${texto.length} caracteres — o máximo é ${JUSTIFICATIVA_MAX}.`
              : curto
                ? `${texto.length} de ${JUSTIFICATIVA_MIN} caracteres mínimos exigidos pela SEFAZ.`
                : `${texto.length} caracteres.`
          }
          error={longo ? "Justificativa longa demais." : undefined}
        >
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Ex.: Pedido cancelado pelo comprador antes do envio da mercadoria"
            className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-[0.8125rem] text-strong outline-none focus:border-brand"
          />
        </Field>
      </div>
    </Dialog>
  );
}
