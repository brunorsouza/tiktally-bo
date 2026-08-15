import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { boFiscal } from "@/lib/boFiscal";
import { useToast } from "@/components/ui/toast";
import type { InvoiceFilters } from "@/types";

export const keys = {
  metrics: ["metrics"] as const,
  invoices: (f: InvoiceFilters) => ["invoices", f] as const,
  invoice: (id: string) => ["invoice", id] as const,
  sellers: ["sellers"] as const,
  webhooks: ["webhooks"] as const,
};

export function useMetrics() {
  return useQuery({ queryKey: keys.metrics, queryFn: () => boFiscal.metrics() });
}

export function useInvoices(filters: InvoiceFilters) {
  return useQuery({
    queryKey: keys.invoices(filters),
    queryFn: () => boFiscal.listInvoices(filters),
    placeholderData: (prev) => prev,
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: keys.invoice(id ?? ""),
    queryFn: () => boFiscal.getInvoice(id!),
    enabled: !!id,
  });
}

export function useSellers() {
  return useQuery({ queryKey: keys.sellers, queryFn: () => boFiscal.listSellers() });
}

export function useWebhooks() {
  return useQuery({ queryKey: keys.webhooks, queryFn: () => boFiscal.listWebhooks() });
}

/** Mutations que tocam a Spedy e atualizam o invoice. Invalidam queries afetadas. */
export function useInvoiceActions(invoiceId: string) {
  const qc = useQueryClient();
  const toast = useToast();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: keys.invoice(invoiceId) });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: keys.metrics });
  };

  const checkStatus = useMutation({
    mutationFn: () => boFiscal.checkStatus(invoiceId),
    onSuccess: (inv) => {
      toast.success("Status atualizado", `Status atual: ${inv.status}`);
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao verificar status", e.message),
  });

  const reprocess = useMutation({
    mutationFn: () => boFiscal.reprocess(invoiceId),
    onSuccess: () => {
      toast.success("Reprocessamento enviado", "A nota foi reenviada à SEFAZ via Spedy.");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao reprocessar", e.message),
  });

  const resendEmail = useMutation({
    mutationFn: () => boFiscal.resendEmail(invoiceId),
    onSuccess: () => toast.success("E-mail reenviado"),
    onError: (e: Error) => toast.error("Falha ao reenviar e-mail", e.message),
  });

  const openDocument = useMutation({
    mutationFn: (kind: "pdf" | "xml") =>
      boFiscal.getDocumentUrls(invoiceId).then((urls) => ({ kind, urls })),
    onSuccess: ({ kind, urls }) => {
      const url = kind === "pdf" ? urls.pdf_url : urls.xml_url;
      if (url) window.open(url, "_blank", "noopener");
      else toast.error("Documento indisponível", `URL do ${kind.toUpperCase()} não encontrada.`);
    },
    onError: (e: Error) => toast.error("Falha ao abrir documento", e.message),
  });

  /**
   * Cancelamento. Some da tela quando a nota não está autorizada — só nota que
   * existe na SEFAZ pode ser cancelada.
   *
   * O aviso de sucesso NÃO diz "cancelada": a Spedy responde 200 ao ACEITAR o
   * pedido, e quem cancela é a SEFAZ, de forma assíncrona. Quem confirma é o
   * `cron-nfe-status`, que relê o status e grava o desfecho.
   */
  const cancelInvoice = useMutation({
    mutationFn: (reason: string) => boFiscal.cancelInvoice(invoiceId, reason),
    onSuccess: () => {
      toast.success(
        "Cancelamento enviado",
        "A SEFAZ confirma em alguns minutos. O status é atualizado sozinho quando ela responder.",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao cancelar", e.message),
  });

  return { checkStatus, reprocess, resendEmail, openDocument, cancelInvoice };
}

export function useWebhookToggle() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      boFiscal.setWebhook(id, enabled),
    onSuccess: (_d, vars) => {
      toast.success(vars.enabled ? "Webhook habilitado" : "Webhook desabilitado");
      qc.invalidateQueries({ queryKey: keys.webhooks });
    },
    onError: (e: Error) => toast.error("Falha ao alterar webhook", e.message),
  });
}
