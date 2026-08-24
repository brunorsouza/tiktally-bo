import { useState } from "react";
import { Search, Plus } from "lucide-react";
import {
  useAffiliates,
  useAffiliateMutations,
  useAffiliateUserMutation,
  useBusinesses,
  useMe,
} from "@/hooks/useBoCoupons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input, Select, SearchInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader, Field, Note, Segmented, Status } from "@/components/ds";
import { DataTable, CellStack, RowActions, type Column } from "@/components/ds/DataTable";
import { formatCurrency } from "@/lib/formatters";
import type { Affiliate, AffiliateInput, CommissionType, EntityStatus } from "@/types";

function commissionLabel(a: Affiliate): string {
  return a.default_commission_type === "fixed"
    ? formatCurrency(a.default_commission_value / 100)
    : `${a.default_commission_value}%`;
}

export function AffiliatesPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EntityStatus | "">("");
  const [editing, setEditing] = useState<Affiliate | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Affiliate | null>(null);
  const [accessFor, setAccessFor] = useState<Affiliate | null>(null);

  const { data, isLoading, error } = useAffiliates({ search: search || undefined, status: status || undefined });
  const { update, remove } = useAffiliateMutations();
  const { data: me } = useMe();
  const isBusiness = me?.role === "business";

  const toggleStatus = (a: Affiliate) =>
    update.mutate({ id: a.id, input: { status: a.status === "active" ? "suspended" : "active" } });

  const colunas: Column<Affiliate>[] = [
    {
      header: "Afiliado",
      cell: (a) => <CellStack title={a.name} subtitle={a.email} />,
    },
    {
      header: "Carteira",
      hideBelow: "md",
      cell: (a) => a.business_name ?? <span className="text-subtle">Independente</span>,
    },
    {
      header: "Chave PIX",
      hideBelow: "lg",
      cell: (a) => (a.pix_key ? <span className="tabular">{a.pix_key}</span> : <span className="text-subtle">—</span>),
    },
    { header: "Comissão", align: "right", width: "7rem", cell: (a) => commissionLabel(a) },
    {
      header: "Acesso",
      width: "8rem",
      cell: (a) =>
        a.user_id ? (
          <Status tone="success">Vinculado</Status>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setAccessFor(a)}>
            Dar acesso
          </Button>
        ),
    },
    {
      header: "Status",
      width: "6.5rem",
      cell: (a) => (
        <Status tone={a.status === "active" ? "success" : "neutral"}>
          {a.status === "active" ? "Ativo" : "Suspenso"}
        </Status>
      ),
    },
    {
      header: "",
      align: "right",
      width: "9rem",
      cell: (a) => (
        <RowActions>
          <Button variant="ghost" size="sm" onClick={() => toggleStatus(a)}>
            {a.status === "active" ? "Suspender" : "Reativar"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>
            Editar
          </Button>
          <Button variant="ghost" size="sm" className="hover:text-danger" onClick={() => setDeleting(a)}>
            Excluir
          </Button>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Afiliados"
        title="Afiliados"
        description={
          isBusiness
            ? "Afiliados da sua carteira. Eles usam cupons vinculados à sua conta."
            : "Afiliados do programa — independentes ou vinculados à carteira de um business."
        }
        meta={
          data ? <span className="t-caption rounded bg-surface-3 px-1.5 py-0.5">{data.total}</span> : null
        }
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Novo afiliado
          </Button>
        }
      />

      <DataTable
        toolbar={
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(searchInput.trim());
              }}
              className="flex min-w-[16rem] flex-1"
            >
              <SearchInput
                icon={<Search />}
                placeholder="Buscar por nome ou e-mail…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </form>
            <Select
              selectSize="sm"
              className="w-40"
              value={status}
              onChange={(e) => setStatus(e.target.value as EntityStatus | "")}
            >
              <option value="">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="suspended">Suspensos</option>
            </Select>
          </>
        }
          rows={data?.items}
          rowKey={(a) => a.id}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          empty={{
            title: "Nenhum afiliado ainda",
            description: "Crie o primeiro afiliado para começar a distribuir cupons.",
            action: (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Novo afiliado
              </Button>
            ),
          }}
        columns={colunas}
      />

      {(creating || editing) && (
        <AffiliateDialog affiliate={editing} onClose={() => (editing ? setEditing(null) : setCreating(false))} />
      )}

      {accessFor && <AffiliateAccessDialog affiliate={accessFor} onClose={() => setAccessFor(null)} />}

      {deleting && (
        <ConfirmDialog
          title={`Excluir ${deleting.name}?`}
          confirmLabel="Excluir"
          loading={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
          description={
            <>
              Se o afiliado já tiver <strong>comissões ou resgates</strong>, ele é{" "}
              <strong>suspenso</strong> em vez de excluído — o histórico financeiro é preservado.
              Sem histórico, é removido de vez e os cupons dele ficam sem afiliado.
            </>
          }
        />
      )}
    </div>
  );
}

/** Mantido para as telas que já importavam daqui; agora usa o Status do DS. */
export function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  return <Status tone={active ? "success" : "neutral"}>{active ? "Ativo" : "Suspenso"}</Status>;
}

function AffiliateDialog({ affiliate, onClose }: { affiliate: Affiliate | null; onClose: () => void }) {
  const isEdit = !!affiliate;
  const { create, update } = useAffiliateMutations();
  const { data: me } = useMe();
  const isBusiness = me?.role === "business";
  // Business não escolhe carteira — o servidor força a dele (e não pode listar
  // businesses), então nem busca.
  const { data: bizData } = useBusinesses(undefined, !isBusiness);

  const [name, setName] = useState(affiliate?.name ?? "");
  const [email, setEmail] = useState(affiliate?.email ?? "");
  const [businessId, setBusinessId] = useState(affiliate?.business_id ?? "");
  const [pixKey, setPixKey] = useState(affiliate?.pix_key ?? "");
  const [status, setStatus] = useState<EntityStatus>((affiliate?.status as EntityStatus) ?? "active");
  const [commType, setCommType] = useState<CommissionType>((affiliate?.default_commission_type as CommissionType) ?? "percent");
  const [commValueInput, setCommValueInput] = useState(
    affiliate
      ? affiliate.default_commission_type === "fixed"
        ? String(affiliate.default_commission_value / 100)
        : String(affiliate.default_commission_value)
      : ""
  );

  const busy = create.isPending || update.isPending;
  const canSubmit = name.trim().length >= 2 && !busy;

  const submit = () => {
    const v = Number(commValueInput) || 0;
    const input: AffiliateInput = {
      name: name.trim(),
      email: email || null,
      business_id: businessId || null,
      pix_key: pixKey || null,
      status,
      default_commission_type: commType,
      default_commission_value: commType === "fixed" ? Math.round(v * 100) : v,
    };
    if (isEdit) update.mutate({ id: affiliate!.id, input }, { onSuccess: onClose });
    else create.mutate(input, { onSuccess: onClose });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Editar ${affiliate?.name}` : "Novo afiliado"}
      description="Quem distribui cupons e recebe comissão sobre o valor pago."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!canSubmit}>
            {isEdit ? "Salvar" : "Criar afiliado"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!isEdit} placeholder="Nome do afiliado" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="afiliado@email.com" />
          </Field>
          {!isBusiness && (
            <Field label="Business (carteira)">
              <Select value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
                <option value="">— Independente (admin)</option>
                {(bizData?.items ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label="Chave PIX (recebimento de comissão)">
          <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="e-mail, CPF, telefone ou aleatória" />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Tipo de comissão">
            {/* Sem a unidade no rótulo: ela já aparece no campo "Valor" ao lado,
                e o texto longo cortava sob a seta na coluna estreita */}
            <Select value={commType} onChange={(e) => setCommType(e.target.value as CommissionType)}>
              <option value="percent">Percentual</option>
              <option value="fixed">Fixa</option>
            </Select>
          </Field>
          <Field label={`Valor (${commType === "fixed" ? "R$" : "%"})`}>
            <Input
              type="number"
              min={0}
              step={commType === "fixed" ? "0.01" : "1"}
              value={commValueInput}
              onChange={(e) => setCommValueInput(e.target.value)}
              placeholder={commType === "fixed" ? "50,00" : "20"}
            />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as EntityStatus)}>
              <option value="active">Ativo</option>
              <option value="suspended">Suspenso</option>
            </Select>
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Dá acesso ao afiliado ao backoffice (painel do próprio desempenho).
 * Também é o que ATIVA o anti-fraude de auto-uso: sem `user_id` vinculado, o
 * servidor não consegue barrar o afiliado de comprar com o próprio cupom.
 */
function AffiliateAccessDialog({ affiliate, onClose }: { affiliate: Affiliate; onClose: () => void }) {
  const { create, link } = useAffiliateUserMutation();
  const { data: me } = useMe();

  /**
   * Criar login é ato de ADMIN — o servidor recusa para business.
   *
   * O motivo está no gate da `bo-coupons`: `createUser` define senha e marca o
   * e-mail como confirmado SEM prova de posse. Um parceiro poderia "reservar"
   * o e-mail de um terceiro (que aí não conseguiria mais se cadastrar) e
   * farmar contas órfãs — criar afiliado, criar login, apagar afiliado.
   *
   * A tela precisa dizer isso ANTES do clique. Oferecer os dois modos e deixar
   * o 403 explicar depois é o que estava acontecendo: o parceiro preenchia
   * e-mail e senha, clicava, e levava "Ação não permitida para o seu perfil"
   * sem nenhuma pista do que fazer em vez disso.
   */
  const podeCriarLogin = me?.role === "admin";

  const [mode, setMode] = useState<"link" | "create">("link");
  const [email, setEmail] = useState(affiliate.email ?? "");
  const [password, setPassword] = useState("");

  const generate = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    setPassword(Array.from(bytes, (b) => chars[b % chars.length]).join(""));
  };

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const valid = mode === "link" ? emailOk : emailOk && password.length >= 8;
  const busy = create.isPending || link.isPending;

  const submit = () => {
    if (mode === "link") {
      link.mutate({ affiliateId: affiliate.id, email: email.trim() }, { onSuccess: onClose });
    } else {
      create.mutate({ affiliate_id: affiliate.id, email: email.trim(), password }, { onSuccess: onClose });
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Dar acesso — ${affiliate.name}`}
      description="Login no backoffice para acompanhar o próprio desempenho."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!valid}>
            {mode === "link" ? "Vincular conta" : "Criar acesso"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {podeCriarLogin ? (
          <Field label="Como">
            <Segmented
              value={mode}
              onChange={(v) => setMode(v)}
              options={[
                { value: "link" as const, label: "Conta existente" },
                { value: "create" as const, label: "Criar conta" },
              ]}
            />
          </Field>
        ) : null}

        <Note tone={podeCriarLogin ? "neutral" : "warning"}>
          {mode === "link" ? (
            <>
              Use quando o e-mail <strong className="font-medium text-strong">já tem login no TikTally</strong>.
              A mesma conta passa a ver também o painel do afiliado — sem criar login novo e sem
              alterar a senha dela.
              {!podeCriarLogin && (
                <>
                  {" "}
                  Criar um login do zero é ação do administrador da TikTally: peça pro afiliado se
                  cadastrar primeiro, e depois vincule aqui.
                </>
              )}
            </>
          ) : (
            <>Cria um login novo. Envie a senha por um canal seguro e peça pra trocar depois.</>
          )}
        </Note>

        <Field label="E-mail de acesso">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="afiliado@email.com" />
        </Field>

        {mode === "create" && (
          <Field label="Senha provisória (mín. 8 caracteres)">
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="senha provisória" className="font-mono" />
              <Button variant="outline" onClick={generate} type="button">
                Gerar
              </Button>
            </div>
          </Field>
        )}

        <p className="t-caption leading-relaxed">
          Ele vê <strong className="font-medium text-strong">apenas o próprio desempenho</strong>{" "}
          (cupom, usos e comissões) e edita só a própria chave PIX. Vincular também{" "}
          <strong className="font-medium text-strong">impede</strong> que ele use o próprio cupom.
        </p>
      </div>
    </Dialog>
  );
}


