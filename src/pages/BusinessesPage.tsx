import { useState } from "react";
import { Search, Plus, Building2 } from "lucide-react";
import { useBusinesses, useBusinessMutations, useBusinessUserMutation } from "@/hooks/useBoCoupons";
import { Input, Select, SearchInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader, Field, Chip, Status } from "@/components/ds";
import { DataTable, CellStack, RowActions, type Column } from "@/components/ds/DataTable";
import { StatusBadge } from "./AffiliatesPage";
import type { Business, BusinessInput, EntityStatus } from "@/types";

export function BusinessesPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Business | null>(null);
  const [creating, setCreating] = useState(false);
  const [accessFor, setAccessFor] = useState<Business | null>(null);

  const { data, isLoading, error } = useBusinesses(search || undefined);
  const { update } = useBusinessMutations();

  const toggleStatus = (b: Business) =>
    update.mutate({ id: b.id, input: { status: b.status === "active" ? "suspended" : "active" } });

  const colunas: Column<Business>[] = [
    {
      header: "Business",
      cell: (b) => <CellStack title={b.name} subtitle={b.email ?? undefined} />,
    },
    {
      header: "Afiliados",
      align: "right",
      width: "7rem",
      cell: (b) => b.affiliates_count ?? 0,
    },
    {
      header: "Acesso",
      width: "9rem",
      hideBelow: "md",
      cell: (b) =>
        b.owner_user_id ? (
          <Status tone="success">Vinculado</Status>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setAccessFor(b)}>
            Dar acesso
          </Button>
        ),
    },
    { header: "Status", width: "7rem", cell: (b) => <StatusBadge status={b.status} /> },
    {
      header: "",
      align: "right",
      width: "11rem",
      cell: (b) => (
        <RowActions>
          <Button variant="ghost" size="sm" onClick={() => toggleStatus(b)}>
            {b.status === "active" ? "Suspender" : "Reativar"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>
            Editar
          </Button>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Afiliados"
        title="Businesses"
        description="Parceiros e agências que gerem uma carteira de afiliados e cupons."
        meta={data && <span className="t-overline">{data.items.length}</span>}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Novo business
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
          </>
        }
        rows={data?.items}
        rowKey={(b) => b.id}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        empty={{
          title: "Nenhum business ainda",
          description: "Cadastre o primeiro parceiro para ele gerir a própria carteira.",
          icon: <Building2 />,
          action: (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Novo business
            </Button>
          ),
        }}
        columns={colunas}
      />

      {(creating || editing) && (
        <BusinessDialog business={editing} onClose={() => (editing ? setEditing(null) : setCreating(false))} />
      )}
      {accessFor && <AccessDialog business={accessFor} onClose={() => setAccessFor(null)} />}
    </div>
  );
}

function BusinessDialog({ business, onClose }: { business: Business | null; onClose: () => void }) {
  const isEdit = !!business;
  const { create, update } = useBusinessMutations();

  const [name, setName] = useState(business?.name ?? "");
  const [email, setEmail] = useState(business?.email ?? "");
  const [status, setStatus] = useState<EntityStatus>((business?.status as EntityStatus) ?? "active");
  const [notes, setNotes] = useState(business?.notes ?? "");

  const busy = create.isPending || update.isPending;
  const canSubmit = name.trim().length >= 2 && !busy;

  const submit = () => {
    const input: BusinessInput = { name: name.trim(), email: email || null, status, notes: notes || null };
    if (isEdit) update.mutate({ id: business!.id, input }, { onSuccess: onClose });
    else create.mutate(input, { onSuccess: onClose });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Editar ${business?.name}` : "Novo business"}
      description="Parceiro que gere a própria carteira de afiliados e cupons."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!canSubmit}>
            {isEdit ? "Salvar" : "Criar business"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!isEdit} placeholder="Nome da agência/parceiro" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@parceiro.com" />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as EntityStatus)}>
              <option value="active">Ativo</option>
              <option value="suspended">Suspenso</option>
            </Select>
          </Field>
        </div>
        <Field label="Notas (internas)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações" />
        </Field>
      </div>
    </Dialog>
  );
}

/**
 * Dá acesso ao dono do business. Dois caminhos:
 *  - Vincular conta existente (padrão): o e-mail já tem login no TikTally
 *    (ex.: Seller). A MESMA conta vira dona do business — sem duplicar login
 *    nem tocar na senha dela.
 *  - Criar conta nova: quando o parceiro ainda não tem conta.
 */
function AccessDialog({ business, onClose }: { business: Business; onClose: () => void }) {
  const { create, link } = useBusinessUserMutation();
  const [mode, setMode] = useState<"link" | "create">("link");
  const [email, setEmail] = useState(business.email ?? "");
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
      link.mutate({ businessId: business.id, email: email.trim() }, { onSuccess: onClose });
    } else {
      create.mutate({ business_id: business.id, email: email.trim(), password }, { onSuccess: onClose });
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Dar acesso — ${business.name}`}
      description="Ele passa a ver apenas a própria carteira (afiliados e comissões)."
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
        <div className="flex gap-2">
          <Chip active={mode === "link"} onClick={() => setMode("link")}>
            Vincular existente
          </Chip>
          <Chip active={mode === "create"} onClick={() => setMode("create")}>
            Criar conta nova
          </Chip>
        </div>

        <p className="t-caption leading-relaxed">
          {mode === "link" ? (
            <>
              Use quando o e-mail <strong className="text-strong">já tem login no TikTally</strong>{" "}
              (ex.: conta de Seller). A mesma conta passa a ver também a carteira — sem criar login
              novo e sem alterar a senha dela.
            </>
          ) : (
            <>
              Cria um login novo no backoffice. Envie a senha por um canal seguro e peça pra trocar
              depois.
            </>
          )}
        </p>

        <Field label="E-mail de acesso">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parceiro@empresa.com" />
        </Field>

        {mode === "create" && (
          <Field label="Senha provisória" hint="Mínimo de 8 caracteres.">
            <div className="flex gap-2">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="senha provisória"
                className="font-mono"
              />
              <Button variant="outline" onClick={generate} type="button">
                Gerar
              </Button>
            </div>
          </Field>
        )}
      </div>
    </Dialog>
  );
}
