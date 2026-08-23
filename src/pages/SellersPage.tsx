import { useNavigate } from "react-router-dom";
import { FlaskConical, AlertTriangle, Store } from "lucide-react";
import { useSellers } from "@/hooks/useBoFiscal";
import { PageHeader, Status } from "@/components/ds";
import { DataTable, CellStack, type Column } from "@/components/ds/DataTable";
import { formatCnpj, formatDate } from "@/lib/formatters";

const REGIME_LABEL: Record<string, string> = {
  simples: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
};

/** Certificado a menos de 30 dias do vencimento merece aviso, não só a data. */
const VENCE_EM_BREVE_MS = 30 * 864e5;

export function SellersPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useSellers();

  type Seller = NonNullable<typeof data>[number];

  const colunas: Column<Seller>[] = [
    {
      header: "Seller",
      cell: (s) => (
        <div className="flex items-center gap-1.5">
          <CellStack title={s.shop_name || s.nome_fantasia || "—"} subtitle={s.email} />
          {s.spedy_use_sandbox && <FlaskConical className="h-3 w-3 shrink-0 text-warning" aria-label="sandbox" />}
        </div>
      ),
    },
    {
      header: "CNPJ",
      width: "10rem",
      hideBelow: "md",
      cell: (s) => <span className="tabular text-subtle">{formatCnpj(s.cnpj)}</span>,
    },
    {
      header: "Regime",
      width: "10rem",
      hideBelow: "lg",
      cell: (s) => REGIME_LABEL[s.regime_tributario ?? ""] || s.regime_tributario || "—",
    },
    {
      header: "Spedy",
      width: "7rem",
      cell: (s) =>
        s.spedy_active ? <Status tone="success">ativo</Status> : <Status tone="neutral">inativo</Status>,
    },
    {
      header: "Certificado",
      width: "9rem",
      hideBelow: "md",
      cell: (s) => {
        if (!s.certificate_expires_at) return <span className="text-subtle">—</span>;
        const vencendo = new Date(s.certificate_expires_at).getTime() - Date.now() < VENCE_EM_BREVE_MS;
        return (
          <span className={vencendo ? "flex items-center gap-1 text-warning" : "tabular text-subtle"}>
            {vencendo && <AlertTriangle className="h-3 w-3 shrink-0" />}
            <span className="tabular">{formatDate(s.certificate_expires_at)}</span>
          </span>
        );
      },
    },
    { header: "Notas", align: "right", width: "5.5rem", cell: (s) => s.counts.total },
    {
      header: "Rejeit.",
      align: "right",
      width: "5.5rem",
      cell: (s) => (s.counts.rejected > 0 ? <span className="text-danger">{s.counts.rejected}</span> : 0),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Fiscal"
        title="Sellers com config fiscal"
        description="Empresas cadastradas na Spedy, regime, certificado e volume de notas."
        meta={data && <span className="t-overline">{data.length}</span>}
      />

      <DataTable
        rows={data}
        rowKey={(s) => s.user_id}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        onRowClick={(s) => navigate(`/invoices?user=${s.user_id}`)}
        empty={{
          title: "Nenhum seller com config fiscal",
          description: "Sellers aparecem aqui depois de configurar a emissão na Spedy.",
          icon: <Store />,
        }}
        columns={colunas}
      />
    </div>
  );
}
