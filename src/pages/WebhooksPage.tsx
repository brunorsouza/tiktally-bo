import { Webhook as WebhookIcon, Power, PowerOff } from "lucide-react";
import { useWebhooks, useWebhookToggle } from "@/hooks/useBoFiscal";
import { Button } from "@/components/ui/button";
import { PageHeader, Status } from "@/components/ds";
import { DataTable, RowActions, type Column } from "@/components/ds/DataTable";

export function WebhooksPage() {
  const { data, isLoading, error } = useWebhooks();
  const toggle = useWebhookToggle();

  type Hook = NonNullable<typeof data>[number];
  const habilitado = (w: Hook) => w.enabled ?? w.isActive ?? true;

  const colunas: Column<Hook>[] = [
    { header: "Evento", width: "14rem", cell: (w) => <span className="font-mono text-strong">{w.event}</span> },
    {
      header: "URL",
      cell: (w) => (
        <span className="block truncate font-mono text-[0.6875rem] text-subtle" title={w.url}>
          {w.url}
        </span>
      ),
    },
    {
      header: "Status",
      width: "9rem",
      cell: (w) =>
        habilitado(w) ? <Status tone="success">habilitado</Status> : <Status tone="danger">desabilitado</Status>,
    },
    {
      header: "",
      align: "right",
      width: "9rem",
      cell: (w) => (
        <RowActions>
          <Button
            size="sm"
            variant={habilitado(w) ? "outline" : "success"}
            loading={toggle.isPending && toggle.variables?.id === w.id}
            onClick={() => toggle.mutate({ id: w.id, enabled: !habilitado(w) })}
          >
            {habilitado(w) ? (
              <>
                <PowerOff /> Desabilitar
              </>
            ) : (
              <>
                <Power /> Habilitar
              </>
            )}
          </Button>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Webhooks Spedy"
        description="Webhooks da conta Spedy (escopo: conta, não empresa). Reabilite os que a Spedy desligou após 5 falhas de entrega."
        meta={data && <span className="t-overline">{data.length}</span>}
      />

      <DataTable
        rows={data}
        rowKey={(w) => String(w.id)}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        empty={{
          title: "Nenhum webhook cadastrado",
          description: "Cadastre os webhooks no painel da Spedy para receber os eventos de NF-e.",
          icon: <WebhookIcon />,
        }}
        columns={colunas}
      />
    </div>
  );
}
