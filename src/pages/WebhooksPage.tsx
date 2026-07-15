import { Webhook as WebhookIcon, Power, PowerOff } from "lucide-react";
import { useWebhooks, useWebhookToggle } from "@/hooks/useBoFiscal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CenteredSpinner } from "@/components/ui/spinner";

export function WebhooksPage() {
  const { data, isLoading, error } = useWebhooks();
  const toggle = useWebhookToggle();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Webhooks Spedy</h1>
        <p className="text-sm text-muted-foreground">
          Webhooks da conta Spedy (escopo: conta, não empresa). Reabilite os que a Spedy desligou
          após 5 falhas de entrega.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WebhookIcon className="h-4 w-4" /> Registros
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <CenteredSpinner label="Carregando webhooks…" />
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>
          ) : !data || data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum webhook cadastrado na Spedy.
            </p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Evento</TH>
                  <TH>URL</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Ação</TH>
                </TR>
              </THead>
              <TBody>
                {data.map((w) => {
                  const enabled = w.enabled ?? w.isActive ?? true;
                  return (
                    <TR key={w.id}>
                      <TD>
                        <Badge tone="info">{w.event}</Badge>
                      </TD>
                      <TD className="max-w-[320px] truncate text-muted-foreground" title={w.url}>
                        {w.url}
                      </TD>
                      <TD>
                        {enabled ? (
                          <Badge tone="success">habilitado</Badge>
                        ) : (
                          <Badge tone="destructive">desabilitado</Badge>
                        )}
                      </TD>
                      <TD className="text-right">
                        <Button
                          size="sm"
                          variant={enabled ? "outline" : "success"}
                          loading={toggle.isPending && toggle.variables?.id === w.id}
                          onClick={() => toggle.mutate({ id: w.id, enabled: !enabled })}
                        >
                          {enabled ? (
                            <>
                              <PowerOff className="h-4 w-4" /> Desabilitar
                            </>
                          ) : (
                            <>
                              <Power className="h-4 w-4" /> Habilitar
                            </>
                          )}
                        </Button>
                      </TD>
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
