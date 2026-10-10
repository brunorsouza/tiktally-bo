import { useState } from "react";
import { Building2, Copy } from "lucide-react";

import { useAgencies, useAgencyMutations } from "@/hooks/useBoAgencies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CellStack, DataTable, type Column } from "@/components/ds/DataTable";
import { Field, Fieldset, Note, PageHeader, Status } from "@/components/ds";
import { formatDate } from "@/lib/formatters";
import type { BoAgency, BoAgencyCreated } from "@/lib/boAgencies";

/**
 * Agências do app.
 *
 * A conta de agência nasce aqui (decisão de 2026-10-10). O admin informa o
 * nome, o CNPJ e o e-mail do dono, e a conta já entra no app como agência: a
 * tela inicial é a carteira de sellers, sem loja, sem plano e sem paywall.
 *
 * Ao criar, o gateway também coloca o dono no piloto do flag `agencias`. Sem
 * isso a conta entraria e não veria nada.
 *
 * Contas separadas: um e-mail que já é de seller (loja conectada ou vínculo
 * com agência) é recusado. Para o dono que também vende, outro e-mail.
 */
export function AgenciesPage() {
  const { data, isLoading, error } = useAgencies();
  const { create, setStatus } = useAgencyMutations();

  const [form, setForm] = useState({ name: "", cnpj: "", owner_email: "" });
  const [created, setCreated] = useState<BoAgencyCreated | null>(null);
  const [suspending, setSuspending] = useState<BoAgency | null>(null);

  const canSubmit = form.name.trim().length >= 2 && form.owner_email.trim().length > 3;

  const columns: Column<BoAgency>[] = [
    {
      header: "Agência",
      cell: (a) => <CellStack title={a.name} subtitle={a.cnpj ? `CNPJ ${a.cnpj}` : undefined} />,
    },
    { header: "Dono", cell: (a) => a.owner_email ?? "—" },
    { header: "Cupom", cell: (a) => (a.coupon_code ? <code>{a.coupon_code}</code> : "—"), hideBelow: "md" },
    { header: "Sellers ativos", cell: (a) => a.sellers_active, align: "right", width: "8rem" },
    { header: "Convites", cell: (a) => a.sellers_pending, align: "right", width: "7rem", hideBelow: "md" },
    { header: "Criada", cell: (a) => formatDate(a.created_at), width: "8rem", hideBelow: "lg" },
    {
      header: "Status",
      cell: (a) => (
        <Status tone={a.status === "active" ? "success" : "warning"}>
          {a.status === "active" ? "Ativa" : "Suspensa"}
        </Status>
      ),
      width: "7rem",
    },
    {
      header: "",
      cell: (a) =>
        a.status === "active" ? (
          <Button variant="ghost" size="sm" onClick={() => setSuspending(a)}>
            Suspender
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: a.id, status: "active" })}
          >
            Reativar
          </Button>
        ),
      align: "right",
      width: "8rem",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Agências"
        description="Contas de agência: veem a carteira dos sellers que aceitaram o convite, só leitura. A conta nasce aqui."
      />

      <Fieldset
        icon={<Building2 className="h-4 w-4" />}
        title="Nova agência"
        description="Cria a conta do dono já como agência, o cupom de 5% e libera o acesso (piloto do flag agencias)."
      >
        <form
          className="grid gap-4 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            create.mutate(
              {
                name: form.name.trim(),
                cnpj: form.cnpj.trim() || undefined,
                owner_email: form.owner_email.trim(),
              },
              {
                onSuccess: (r) => {
                  setCreated(r);
                  setForm({ name: "", cnpj: "", owner_email: "" });
                },
              },
            );
          }}
        >
          <Field label="Nome da agência">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={120} />
          </Field>
          <Field label="CNPJ (opcional)">
            <Input
              value={form.cnpj}
              onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))}
              inputMode="numeric"
              maxLength={18}
            />
          </Field>
          <Field label="E-mail do dono" hint="Não pode ser o e-mail de uma conta de seller.">
            <Input
              type="email"
              value={form.owner_email}
              onChange={(e) => setForm((f) => ({ ...f, owner_email: e.target.value }))}
            />
          </Field>
          <div className="md:col-span-3">
            <Button type="submit" disabled={!canSubmit || create.isPending} loading={create.isPending}>
              Criar agência
            </Button>
          </div>
        </form>

        {created && (
          <div className="mt-5 flex flex-col gap-2">
            <Note tone="brand">
              <strong>{created.agency.name}</strong> criada para {created.agency.owner_email}.
              {created.agency.coupon_code ? ` Cupom: ${created.agency.coupon_code}.` : ""}{" "}
              {created.new_account
                ? created.email_sent
                  ? "Mandamos o link para definir a senha por e-mail."
                  : "O e-mail não saiu. Envie o link abaixo ao dono para ele definir a senha."
                : "A conta já existia: o dono entra com o login de sempre e cai na carteira."}
            </Note>
            {created.access_url && (
              <div className="flex items-center gap-2">
                <Input readOnly value={created.access_url} className="font-mono text-[0.75rem]" />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigator.clipboard.writeText(created.access_url!).catch(() => undefined)}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copiar
                </Button>
              </div>
            )}
          </div>
        )}
      </Fieldset>

      <DataTable
        columns={columns}
        rows={data?.agencies}
        rowKey={(a) => a.id}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        empty={{ title: "Nenhuma agência ainda", description: "Crie a primeira acima." }}
      />

      {suspending && (
        <ConfirmDialog
          title="Suspender agência"
          confirmLabel="Suspender"
          loading={setStatus.isPending}
          onClose={() => setSuspending(null)}
          onConfirm={() =>
            setStatus.mutate({ id: suspending.id, status: "suspended" }, { onSuccess: () => setSuspending(null) })
          }
          description={
            <>
              <strong className="text-strong">{suspending.name}</strong> deixa de ver a carteira na hora. Os vínculos
              com os sellers ficam guardados e voltam a valer se a agência for reativada.
            </>
          }
        />
      )}
    </div>
  );
}
