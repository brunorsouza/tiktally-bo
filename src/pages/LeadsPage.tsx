import { useEffect, useState } from "react";
import {
  Download,
  Mail,
  MessageCircle,
  Search,
  Trash2,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import { useLeadMutations, useLeads, useLeadsOverview } from "@/hooks/useBoLeads";
import { Input, SearchInput, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  ColumnChart,
  EmptyState,
  ErrorState,
  Field,
  Note,
  PageHeader,
  Pagination,
  Panel,
  Segmented,
  Skeleton,
  Stat,
  StatGrid,
  Status,
  StatusChips,
} from "@/components/ds";
import { CellStack, DataTable, RowActions, type Column } from "@/components/ds/DataTable";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime } from "@/lib/formatters";
import type { Lead, LeadFollowupStatus } from "@/types";

/**
 * Leads da landing.
 *
 * A tabela `pricing_leads` é escrita pelo gate de preço do site: o visitante
 * deixa nome, e-mail e WhatsApp pra ver os planos, e se depois clica num plano
 * o registro guarda qual. Essa segunda marca é o que a tela chama de quente.
 *
 * O que a lista crua não respondia, e por isso está aqui:
 *  - o lead já virou conta no TikTally? (cruzamento por e-mail, no gateway)
 *  - alguém já falou com ele? (triagem gravada em metadata.followup)
 */

const PERIODS = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

const STATUS_META: Record<
  LeadFollowupStatus,
  { label: string; tone: "neutral" | "info" | "success" | "danger" }
> = {
  new: { label: "Novo", tone: "neutral" },
  contacted: { label: "Contatado", tone: "info" },
  won: { label: "Ganho", tone: "success" },
  lost: { label: "Perdido", tone: "danger" },
};

const PLAN_LABEL: Record<string, string> = {
  pro: "Pro",
  erp: "ERP",
  business: "Business",
  tiktally: "Começo",
};

const CYCLE_LABEL: Record<string, string> = {
  semiannually: "semestral",
  yearly: "anual",
};

const SUB_STATUS_LABEL: Record<string, string> = {
  active: "assinante",
  trial: "em teste",
  expired: "expirado",
  cancelled: "cancelado",
};

const waLink = (whatsapp: string) => {
  const digits = whatsapp.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
};

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export function LeadsPage() {
  const toast = useToast();
  const [period, setPeriod] = useState(30);
  const [status, setStatus] = useState<LeadFollowupStatus | "">("");
  const [temperature, setTemperature] = useState<"cold" | "hot" | "">("");
  const [search, setSearch] = useState("");
  // A busca só vira consulta depois que a pessoa para de digitar: cada letra
  // dispara a lista e mais cinco contagens no gateway.
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [emTriagem, setEmTriagem] = useState<Lead | null>(null);
  const [aExcluir, setAExcluir] = useState<Lead | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const overview = useLeadsOverview(period);
  const { data, isLoading, isFetching, error } = useLeads({
    status,
    temperature,
    search: buscaAplicada || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
    page,
    pageSize: 50,
  });
  const { update, remove } = useLeadMutations();

  const reset = () => setPage(1);

  const exportCsv = () => {
    const items = data?.items ?? [];
    if (!items.length) {
      toast.error("Nada para exportar");
      return;
    }
    const csv = toCsv(
      items.map((l) => ({
        data: formatDateTime(l.created_at),
        nome: l.name,
        email: l.email,
        whatsapp: l.whatsapp,
        interesse: l.proceeded_at ? PLAN_LABEL[l.proceeded_plan ?? ""] ?? l.proceeded_plan ?? "quente" : "só viu preço",
        conta: l.account ? SUB_STATUS_LABEL[l.account.status ?? ""] ?? l.account.status ?? "criada" : "",
        triagem: STATUS_META[l.followup_status].label,
        anotacao: l.followup_note ?? "",
      }))
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado", `${items.length} linha(s)`);
  };

  const contagem = data?.counts;
  const contasIncompletas = data?.accountsComplete === false;

  const colunas: Column<Lead>[] = [
    {
      header: "Lead",
      width: "14rem",
      className: "max-w-[14rem]",
      cell: (l) => <CellStack title={<span className="text-strong">{l.name}</span>} subtitle={l.email} />,
    },
    {
      header: "Entrou",
      width: "6.5rem",
      cell: (l) => <span className="tabular text-subtle">{formatDate(l.created_at)}</span>,
    },
    {
      header: "Interesse",
      width: "9rem",
      cell: (l) =>
        l.proceeded_at ? (
          <Status tone="brand">
            {l.proceeded_plan
              ? `${PLAN_LABEL[l.proceeded_plan] ?? l.proceeded_plan}${
                  l.plan_cycle ? ` ${CYCLE_LABEL[l.plan_cycle] ?? l.plan_cycle}` : ""
                }`
              : "Quente"}
          </Status>
        ) : (
          <span className="t-caption">Só viu o preço</span>
        ),
    },
    {
      header: "Conta",
      width: "10rem",
      hideBelow: "lg",
      cell: (l) =>
        l.account ? (
          <CellStack
            title={<span className="text-strong">{l.account.shop_name ?? "Conta criada"}</span>}
            subtitle={
              [
                PLAN_LABEL[l.account.plan ?? ""] ?? l.account.plan,
                SUB_STATUS_LABEL[l.account.status ?? ""] ?? l.account.status,
              ]
                .filter(Boolean)
                .join(", ") || "sem assinatura"
            }
          />
        ) : contasIncompletas ? (
          <span className="t-caption">Não verificado</span>
        ) : (
          <span className="t-caption">Não se cadastrou</span>
        ),
    },
    {
      header: "Triagem",
      width: "7.5rem",
      cell: (l) => <Status tone={STATUS_META[l.followup_status].tone}>{STATUS_META[l.followup_status].label}</Status>,
    },
    {
      header: "",
      width: "8rem",
      align: "right",
      cell: (l) => (
        <RowActions>
          <a href={waLink(l.whatsapp)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon-sm" title="Abrir no WhatsApp">
              <MessageCircle />
            </Button>
          </a>
          <a href={`mailto:${l.email}`} onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon-sm" title="Enviar e-mail">
              <Mail />
            </Button>
          </a>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Excluir lead"
            onClick={(e) => {
              e.stopPropagation();
              setAExcluir(l);
            }}
          >
            <Trash2 />
          </Button>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comercial"
        title="Leads"
        description="Quem deixou contato no site para ver os preços."
        actions={
          <div className="flex items-center gap-2">
            <Segmented value={period} options={PERIODS} onChange={setPeriod} />
            <Button variant="outline" onClick={exportCsv}>
              <Download /> Exportar CSV
            </Button>
          </div>
        }
      />

      {overview.isLoading ? (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : overview.error ? (
        <ErrorState message={(overview.error as Error).message} />
      ) : overview.data ? (
        <>
          <StatGrid cols={5}>
            <Stat label={`Leads ${period}d`} value={overview.data.inPeriod} hint={`${overview.data.total} no total`} />
            <Stat
              label="Quentes"
              value={overview.data.hot}
              tone="brand"
              hint="clicaram num plano"
            />
            <Stat
              label="Viraram conta"
              value={overview.data.withAccount ?? "—"}
              tone="success"
              hint={overview.data.withAccount === null ? "não foi possível cruzar" : "mesmo e-mail no app"}
            />
            <Stat label="Sem triagem" value={overview.data.byStatus.new} tone="warning" hint="ninguém falou ainda" />
            <Stat label="Ganhos" value={overview.data.byStatus.won} tone="success" />
          </StatGrid>

          <Panel title={`Leads por dia, ${period}d`}>
            {overview.data.daily.every((d) => d.leads === 0) ? (
              <EmptyState title="Nenhum lead no período" />
            ) : (
              <ColumnChart
                height={132}
                unit="leads"
                data={overview.data.daily.map((d) => ({
                  key: d.date,
                  label: d.date.slice(5),
                  parts: [
                    { value: d.hot, tone: "brand", label: "quentes" },
                    { value: Math.max(0, d.leads - d.hot), tone: "ink", label: "só viram o preço" },
                  ],
                }))}
              />
            )}
          </Panel>
        </>
      ) : null}

      <DataTable
        toolbar={
          <>
            <StatusChips
              value={status}
              onChange={(v) => {
                setStatus(v);
                reset();
              }}
              options={[
                { value: "" as const, label: "Todos", count: contagem?.all },
                { value: "new" as const, label: "Novos", count: contagem?.new, tone: "neutral" },
                { value: "contacted" as const, label: "Contatados", count: contagem?.contacted, tone: "info" },
                { value: "won" as const, label: "Ganhos", count: contagem?.won, tone: "success" },
                { value: "lost" as const, label: "Perdidos", count: contagem?.lost, tone: "danger" },
              ]}
            />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <SearchInput
                icon={<Search />}
                placeholder="Nome, e-mail ou WhatsApp"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  reset();
                }}
                className="w-56"
              />
              <Select
                selectSize="sm"
                className="w-40"
                value={temperature}
                onChange={(e) => {
                  setTemperature(e.target.value as "cold" | "hot" | "");
                  reset();
                }}
              >
                <option value="">Todo interesse</option>
                <option value="hot">Clicou num plano</option>
                <option value="cold">Só viu o preço</option>
              </Select>
              <Input
                inputSize="sm"
                type="date"
                aria-label="Data inicial"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  reset();
                }}
                className="w-36"
              />
              <Input
                inputSize="sm"
                type="date"
                aria-label="Data final"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  reset();
                }}
                className="w-36"
              />
            </div>
          </>
        }
        rows={data?.items}
        rowKey={(l) => l.id}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        onRowClick={(l) => setEmTriagem(l)}
        empty={{
          title: "Nenhum lead",
          description: "Assim que alguém liberar os preços no site, o contato aparece aqui.",
          icon: <UserPlus />,
        }}
        columns={colunas}
        footer={
          data && data.items.length > 0 ? (
            <Pagination
              page={page}
              totalPages={data.totalPages}
              total={data.total}
              unit="leads"
              fetching={isFetching}
              onPage={setPage}
            />
          ) : undefined
        }
      />

      {emTriagem && (
        <TriagemDialog
          lead={emTriagem}
          saving={update.isPending}
          onClose={() => setEmTriagem(null)}
          onSave={(input) =>
            update.mutate(
              { id: emTriagem.id, input },
              { onSuccess: () => setEmTriagem(null) }
            )
          }
        />
      )}

      {aExcluir && (
        <ConfirmDialog
          title="Excluir lead"
          description={
            <>
              O contato de <strong>{aExcluir.name}</strong> ({aExcluir.email}) sai da lista para sempre. Use isso para
              spam ou duplicado.
            </>
          }
          confirmLabel="Excluir"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(aExcluir.id, { onSuccess: () => setAExcluir(null) })}
          onClose={() => setAExcluir(null)}
        />
      )}
    </div>
  );
}

/**
 * Ficha de triagem. O estado e a anotação são a memória do comercial sobre
 * aquele contato, e ficam no metadata do próprio lead.
 */
function TriagemDialog({
  lead,
  saving,
  onSave,
  onClose,
}: {
  lead: Lead;
  saving: boolean;
  onSave: (input: { status: LeadFollowupStatus; note: string }) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<LeadFollowupStatus>(lead.followup_status);
  const [note, setNote] = useState(lead.followup_note ?? "");

  return (
    <Dialog
      open
      onClose={onClose}
      title={lead.name}
      description={`Entrou em ${formatDateTime(lead.created_at)} pelo site`}
      className="max-w-[34rem]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => onSave({ status, note })} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <a href={waLink(lead.whatsapp)} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <MessageCircle /> {lead.whatsapp}
            </Button>
          </a>
          <a href={`mailto:${lead.email}`}>
            <Button variant="ghost" size="sm">
              <Mail /> {lead.email}
            </Button>
          </a>
        </div>

        {lead.account ? (
          <Note tone="brand">
            <div className="flex items-center gap-2">
              <UserRoundCheck className="h-3.5 w-3.5" />
              <span>
                Já tem conta no TikTally{lead.account.shop_name ? ` (${lead.account.shop_name})` : ""}
                {lead.account.plan ? `, plano ${PLAN_LABEL[lead.account.plan] ?? lead.account.plan}` : ""}
                {lead.account.status ? `, ${SUB_STATUS_LABEL[lead.account.status] ?? lead.account.status}` : ""}.
                {lead.account.signed_up_at ? ` Cadastrou em ${formatDate(lead.account.signed_up_at)}.` : ""}
              </span>
            </div>
          </Note>
        ) : null}

        {lead.proceeded_at ? (
          <Note tone="neutral">
            Clicou no plano {PLAN_LABEL[lead.proceeded_plan ?? ""] ?? lead.proceeded_plan ?? "escolhido"}
            {lead.plan_cycle ? ` (${CYCLE_LABEL[lead.plan_cycle] ?? lead.plan_cycle})` : ""} em{" "}
            {formatDateTime(lead.proceeded_at)}.
          </Note>
        ) : (
          <Note tone="neutral">Liberou os preços, mas não clicou em nenhum plano.</Note>
        )}

        {/*
          Grupo de escolha, não um `Field`: o Field do DS é um <label>, e um
          label com vários botões dentro manda todo clique pro primeiro deles.
          Na prática, escolher "Ganho" voltava pra "Novo" sem aviso.
        */}
        <div>
          <span className="t-overline mb-1.5 block">Situação</span>
          <div role="radiogroup" aria-label="Situação" className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_META) as LeadFollowupStatus[]).map((s) => (
              <Button
                key={s}
                type="button"
                role="radio"
                aria-checked={status === s}
                size="sm"
                variant={status === s ? "primary" : "subtle"}
                onClick={() => setStatus(s)}
              >
                {STATUS_META[s].label}
              </Button>
            ))}
          </div>
        </div>

        <Field
          label="Anotação"
          hint={lead.followup_at ? `Última alteração em ${formatDateTime(lead.followup_at)}` : undefined}
        >
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="O que ficou combinado com essa pessoa"
            maxLength={2000}
          />
        </Field>
      </div>
    </Dialog>
  );
}
