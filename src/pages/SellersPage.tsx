import { useNavigate } from "react-router-dom";
import { FlaskConical, CheckCircle2, AlertTriangle } from "lucide-react";
import { useSellers } from "@/hooks/useBoFiscal";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CenteredSpinner } from "@/components/ui/spinner";
import { formatCnpj, formatDate } from "@/lib/formatters";

const REGIME_LABEL: Record<string, string> = {
  simples: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
};

export function SellersPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useSellers();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Sellers com config fiscal</h1>
        <p className="text-sm text-muted-foreground">
          Empresas cadastradas na Spedy, regime, certificado e volume de notas.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <CenteredSpinner label="Carregando sellers…" />
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>
          ) : !data || data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum seller com config fiscal ainda.
            </p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Seller</TH>
                  <TH>CNPJ</TH>
                  <TH>Regime</TH>
                  <TH>Spedy</TH>
                  <TH>Certificado</TH>
                  <TH className="text-right">Notas</TH>
                  <TH className="text-right">Rejeit.</TH>
                </TR>
              </THead>
              <TBody>
                {data.map((s) => {
                  const certExpiring =
                    s.certificate_expires_at &&
                    new Date(s.certificate_expires_at).getTime() - Date.now() < 30 * 864e5;
                  return (
                    <TR
                      key={s.user_id}
                      className="cursor-pointer"
                      onClick={() =>
                        navigate(`/invoices?user=${s.user_id}`)
                      }
                    >
                      <TD>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{s.shop_name || s.nome_fantasia || "—"}</span>
                          {s.spedy_use_sandbox && (
                            <FlaskConical className="h-3.5 w-3.5 text-warning" aria-label="sandbox" />
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{s.email}</span>
                      </TD>
                      <TD className="text-muted-foreground">{formatCnpj(s.cnpj)}</TD>
                      <TD>{REGIME_LABEL[s.regime_tributario ?? ""] || s.regime_tributario || "—"}</TD>
                      <TD>
                        {s.spedy_active ? (
                          <Badge tone="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> ativo
                          </Badge>
                        ) : (
                          <Badge tone="muted">inativo</Badge>
                        )}
                      </TD>
                      <TD>
                        {s.certificate_expires_at ? (
                          <span
                            className={certExpiring ? "flex items-center gap-1 text-warning" : ""}
                          >
                            {certExpiring && <AlertTriangle className="h-3.5 w-3.5" />}
                            {formatDate(s.certificate_expires_at)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">{s.counts.total}</TD>
                      <TD className="text-right tabular-nums">
                        {s.counts.rejected > 0 ? (
                          <span className="text-destructive">{s.counts.rejected}</span>
                        ) : (
                          0
                        )}
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
