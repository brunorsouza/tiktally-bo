import { useState } from "react";
import { ShieldCheck, ShieldOff, UserPlus, Store } from "lucide-react";
import { useAdmins, useAdminMutations } from "@/hooks/useAdmins";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader, Field, Note, Status, Tag, Segmented } from "@/components/ds";
import { DataTable, CellStack, RowActions, type Column } from "@/components/ds/DataTable";
import { formatDateTime } from "@/lib/formatters";
import type { BoAdmin } from "@/types";

/**
 * Quem tem acesso ao backoffice.
 *
 * "Ser admin" é a coluna `profiles.is_admin` — é dela que sai toda a proteção
 * do console. Por isso esta tela é curta de propósito: conceder, revogar, e
 * nada mais. Quanto menos coisa fizer, menos jeito tem de errar aqui.
 */
export function AdminsPage() {
  const { data, isLoading, error } = useAdmins();
  const { revoke } = useAdminMutations();
  const [concedendo, setConcedendo] = useState(false);
  const [revogando, setRevogando] = useState<BoAdmin | null>(null);

  const colunas: Column<BoAdmin>[] = [
    {
      header: "Administrador",
      cell: (a) => (
        <div className="flex items-center gap-2">
          <CellStack title={a.email ?? "—"} subtitle={a.shop_name ?? undefined} />
          {a.eu_mesmo && <Tag tone="brand">você</Tag>}
        </div>
      ),
    },
    {
      header: "Conta",
      width: "11rem",
      hideBelow: "md",
      // Um admin que também é seller é comum (conta de teste do time). Não é
      // problema — o `me` dá prioridade a admin —, mas quem for revogar
      // precisa saber que existe uma loja do outro lado dessa conta.
      cell: (a) =>
        a.tambem_seller ? (
          <Status tone="info">
            <Store className="mr-1 h-3 w-3" />
            também seller
          </Status>
        ) : (
          <span className="text-subtle">só backoffice</span>
        ),
    },
    {
      header: "Último acesso",
      width: "11rem",
      hideBelow: "lg",
      cell: (a) =>
        a.last_sign_in_at ? (
          <span className="tabular text-subtle">{formatDateTime(a.last_sign_in_at)}</span>
        ) : (
          <span className="text-subtle">nunca entrou</span>
        ),
    },
    {
      header: "Criada em",
      width: "10rem",
      hideBelow: "lg",
      cell: (a) => <span className="tabular text-subtle">{formatDateTime(a.created_at)}</span>,
    },
    {
      header: "",
      align: "right",
      width: "8rem",
      cell: (a) => (
        <RowActions>
          <Button
            variant="ghost"
            size="sm"
            disabled={a.eu_mesmo}
            title={a.eu_mesmo ? "Você não pode remover o seu próprio acesso" : "Remover acesso"}
            onClick={() => setRevogando(a)}
          >
            <ShieldOff /> Remover
          </Button>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sistema"
        title="Administradores"
        description="Quem pode entrar no backoffice. O acesso é concedido por conta, e vale para todas as telas de administração."
        meta={data && <span className="t-overline">{data.total}</span>}
        actions={
          <Button size="sm" onClick={() => setConcedendo(true)}>
            <UserPlus /> Novo administrador
          </Button>
        }
      />

      <Note tone="warning">
        Administrador vê e opera <strong className="font-medium text-strong">todas</strong> as contas,
        notas e cupons do sistema, e pode conceder acesso a outras pessoas. Remover o acesso não apaga
        a conta — ela continua existindo e logando no TikTally.
      </Note>

      <DataTable
        rows={data?.items}
        rowKey={(a) => a.user_id}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        empty={{ title: "Nenhum administrador", icon: <ShieldCheck /> }}
        columns={colunas}
      />

      {concedendo && <DialogConceder onClose={() => setConcedendo(false)} />}

      {revogando && (
        <ConfirmDialog
          title="Remover acesso de administrador"
          confirmLabel="Remover acesso"
          loading={revoke.isPending}
          onClose={() => setRevogando(null)}
          onConfirm={() =>
            revoke.mutate(revogando.user_id, { onSuccess: () => setRevogando(null) })
          }
          description={
            <>
              <strong className="text-strong">{revogando.email}</strong> perde o acesso ao backoffice
              agora. A conta continua existindo
              {revogando.tambem_seller && " — inclusive a loja dela no TikTally, que não é afetada"}.
            </>
          }
        />
      )}
    </div>
  );
}

/**
 * Conceder acesso.
 *
 * Dois modos porque o caminho comum é o `link`: quase todo mundo do time já
 * tem login no TikTally. Sem ele, conceder acesso viraria "criar uma segunda
 * conta pra mesma pessoa porque a primeira já existia" — que é como se
 * acumula login órfão.
 */
function DialogConceder({ onClose }: { onClose: () => void }) {
  const { grant } = useAdminMutations();
  const [modo, setModo] = useState<"link" | "create">("link");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  const senhaCurta = modo === "create" && senha.length > 0 && senha.length < 8;
  const podeEnviar = email.trim().length > 3 && (modo === "link" || senha.length >= 8);

  const enviar = () =>
    grant.mutate(
      { email: email.trim(), mode: modo, password: modo === "create" ? senha : undefined },
      { onSuccess: onClose }
    );

  return (
    <Dialog
      open
      onClose={onClose}
      title="Novo administrador"
      description="O acesso vale para todas as telas de administração do backoffice."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={grant.isPending}>
            Cancelar
          </Button>
          <Button onClick={enviar} loading={grant.isPending} disabled={!podeEnviar}>
            Conceder acesso
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Como">
          <Segmented
            value={modo}
            onChange={(v) => setModo(v)}
            options={[
              { value: "link", label: "Conta existente" },
              { value: "create", label: "Criar conta" },
            ]}
          />
        </Field>

        <Note>
          {modo === "link"
            ? "Promove uma conta que já existe (inclusive login de seller do TikTally). A senha dela não é alterada."
            : "Cria um login novo e já concede o acesso. Use quando a pessoa ainda não tem conta nenhuma."}
        </Note>

        <Field label="E-mail">
          <Input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@tiktally.com.br"
          />
        </Field>

        {modo === "create" && (
          <Field
            label="Senha"
            error={senhaCurta ? "Mínimo de 8 caracteres." : undefined}
            hint={senhaCurta ? undefined : "Combine com a pessoa — ela entra com essa senha."}
          >
            <Input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
