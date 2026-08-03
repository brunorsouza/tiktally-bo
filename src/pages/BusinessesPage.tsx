import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { useBusinesses, useBusinessMutations, useBusinessUserMutation } from "@/hooks/useBoCoupons";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CenteredSpinner } from "@/components/ui/spinner";
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

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Businesses</h1>
          <p className="text-sm text-muted-foreground">
            Parceiros / agências que gerem uma carteira de afiliados e cupons.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Novo business
        </Button>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
            className="relative min-w-[200px]"
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome ou e-mail…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <CenteredSpinner label="Carregando businesses…" />
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>
          ) : !data || data.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum business encontrado.</p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Nome</TH>
                  <TH>E-mail</TH>
                  <TH className="text-right">Afiliados</TH>
                  <TH>Acesso</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Ações</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((b) => (
                  <TR key={b.id}>
                    <TD className="font-medium">{b.name}</TD>
                    <TD className="text-muted-foreground">{b.email ?? "—"}</TD>
                    <TD className="text-right tabular-nums">{b.affiliates_count ?? 0}</TD>
                    <TD>
                      {b.owner_user_id ? (
                        <span className="text-xs text-success">Vinculado</span>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setAccessFor(b)}>
                          Criar acesso
                        </Button>
                      )}
                    </TD>
                    <TD>
                      <StatusBadge status={b.status} />
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(b)}>
                          {b.status === "active" ? "Suspender" : "Reativar"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>
                          Editar
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
    <Dialog open onClose={onClose} title={isEdit ? `Editar ${business?.name}` : "Novo business"}>
      <div className="space-y-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!isEdit} placeholder="Nome da agência/parceiro" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
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
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!canSubmit}>
            {isEdit ? "Salvar" : "Criar business"}
          </Button>
        </div>
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
    <Dialog open onClose={onClose} title={`Dar acesso — ${business.name}`}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Chip active={mode === "link"} onClick={() => setMode("link")}>
            Vincular conta existente
          </Chip>
          <Chip active={mode === "create"} onClick={() => setMode("create")}>
            Criar conta nova
          </Chip>
        </div>

        <p className="text-xs text-muted-foreground">
          {mode === "link" ? (
            <>
              Use quando o e-mail <strong>já tem login no TikTally</strong> (ex.: conta de Seller). A
              mesma conta passa a ver também a carteira — sem criar login novo e sem alterar a senha
              dela.
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
          <Field label="Senha provisória (mín. 8 caracteres)">
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="senha provisória" className="font-mono" />
              <Button variant="outline" onClick={generate} type="button">
                Gerar
              </Button>
            </div>
          </Field>
        )}

        <p className="text-xs text-muted-foreground">
          Em qualquer caso, ele vê <strong>apenas a carteira dele</strong> (afiliados e comissões).
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!valid}>
            {mode === "link" ? "Vincular conta" : "Criar acesso"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
