import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { useAffiliates, useAffiliateMutations, useBusinesses, useMe } from "@/hooks/useBoCoupons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CenteredSpinner } from "@/components/ui/spinner";
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

  const { data, isLoading, error } = useAffiliates({ search: search || undefined, status: status || undefined });
  const { update, remove } = useAffiliateMutations();
  const { data: me } = useMe();
  const isBusiness = me?.role === "business";

  const toggleStatus = (a: Affiliate) =>
    update.mutate({ id: a.id, input: { status: a.status === "active" ? "suspended" : "active" } });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Afiliados</h1>
          <p className="text-sm text-muted-foreground">
            {isBusiness
              ? "Afiliados da sua carteira. Eles usam cupons vinculados à sua conta."
              : "Afiliados do programa — independentes ou vinculados à carteira de um business."}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Novo afiliado
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
            className="relative min-w-[200px] flex-1"
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome ou e-mail…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </form>
          <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value as EntityStatus | "")}>
            <option value="">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="suspended">Suspensos</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <CenteredSpinner label="Carregando afiliados…" />
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{(error as Error).message}</p>
          ) : !data || data.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum afiliado encontrado.</p>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Nome</TH>
                  <TH>Business</TH>
                  <TH>Chave PIX</TH>
                  <TH className="text-right">Comissão</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Ações</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <span className="font-medium">{a.name}</span>
                      {a.email && <span className="block text-xs text-muted-foreground">{a.email}</span>}
                    </TD>
                    <TD className="text-muted-foreground">{a.business_name ?? "— independente"}</TD>
                    <TD className="text-muted-foreground">{a.pix_key ?? "—"}</TD>
                    <TD className="text-right tabular-nums">{commissionLabel(a)}</TD>
                    <TD>
                      <StatusBadge status={a.status} />
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(a)}>
                          {a.status === "active" ? "Suspender" : "Reativar"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>
                          Editar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(a)}>
                          Excluir
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
        <AffiliateDialog affiliate={editing} onClose={() => (editing ? setEditing(null) : setCreating(false))} />
      )}

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

export function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
      {active ? "Ativo" : "Suspenso"}
    </span>
  );
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
    <Dialog open onClose={onClose} title={isEdit ? `Editar ${affiliate?.name}` : "Novo afiliado"}>
      <div className="space-y-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!isEdit} placeholder="Nome do afiliado" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tipo de comissão">
            <Select value={commType} onChange={(e) => setCommType(e.target.value as CommissionType)}>
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Fixa (R$)</option>
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
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!canSubmit}>
            {isEdit ? "Salvar" : "Criar afiliado"}
          </Button>
        </div>
      </div>
    </Dialog>
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
