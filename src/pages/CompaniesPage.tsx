/**
 * Empresas na Spedy — o que existe lá dentro, e em que ambiente cada uma emite.
 *
 * Duas perguntas que o app do seller não responde:
 *
 * 1. **"Esse CNPJ já está cadastrado?"** O `POST /companies` recusa com "O CNPJ
 *    já possui uma conta vinculada" enquanto o nosso `fiscal_configs` está sem
 *    `spedy_company_id` — a empresa existe e nós não temos o id. Sem id não se
 *    consulta nem se apaga. A lista aqui é o único lugar que enxerga isso.
 * 2. **"Essa nota vai valer?"** `productInvoice.environmentType` decide: uma
 *    loja de teste da TikTok apontando pra empresa em `production` emite NF-e
 *    REAL de um pedido que não existe.
 *
 * ⚠️ Sandbox e produção da Spedy são CONTAS SEPARADAS — base, chave e dados
 * próprios. O seletor no topo troca de conta, não de filtro: a empresa que
 * aparece numa não existe na outra.
 *
 * A chave da empresa não aparece em lugar nenhum porque não é recuperável: a
 * Spedy a devolve só na criação. Perdeu a chave, o caminho é apagar e recriar.
 */
import { useState } from "react";
import { Building2, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import {
  PageHeader,
  Panel,
  Segmented,
  Info,
  InfoGrid,
  Field,
  Note,
  Skeleton,
  Status,
  Toolbar,
} from "@/components/ds";
import { DataTable, RowActions, type Column } from "@/components/ds/DataTable";
import { useSellers } from "@/hooks/useBoFiscal";
import {
  useSpedyCompanies,
  useSpedyCompanySettings,
  useSpedyCompanyCertificates,
  useSetCompanyEnvironment,
  useDeleteCompany,
} from "@/hooks/useSpedyCompanies";
import type { SpedyCompany, SpedyEnvironmentType } from "@/types";

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

function formatarCnpj(v: string | null): string {
  const d = soDigitos(v);
  if (d.length !== 14) return v ?? "—";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Rótulos do ambiente. "development" é homologação da SEFAZ, não "dev". */
const AMBIENTE: Record<SpedyEnvironmentType, { label: string; tone: "success" | "warning" | "neutral" }> = {
  production: { label: "produção", tone: "success" },
  development: { label: "homologação", tone: "warning" },
  simulation: { label: "simulação", tone: "neutral" },
};

export function CompaniesPage() {
  const [sandbox, setSandbox] = useState(false);
  const [busca, setBusca] = useState("");
  const [selecionada, setSelecionada] = useState<SpedyCompany | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useSpedyCompanies(sandbox);
  /**
   * A lista de sellers é uma consulta SEPARADA e mais lenta (ela conta notas por
   * status, seller a seller). A tabela de empresas termina antes.
   *
   * Por isso os três estados dela importam aqui: com `undefined` a busca abaixo
   * não acha nada, e "não achei" renderizava como "sem vínculo" — a tela
   * acusava de órfã justamente a empresa que ESTÁ vinculada, que é o oposto do
   * que ela existe pra dizer.
   */
  const { data: sellers, isLoading: carregandoSellers, isError: erroSellers } = useSellers();

  // O filtro por CNPJ é local: a lista já veio inteira, e a API da Spedy não
  // tem filtro nenhum — buscar no servidor só refaria a mesma varredura.
  const alvo = soDigitos(busca);
  const empresas = (data?.companies ?? []).filter((c) =>
    alvo ? soDigitos(c.federalTaxNumber).includes(alvo) : true
  );

  /** Seller nosso que aponta pra essa empresa. Vazio = empresa órfã. */
  const sellerDe = (companyId: string | null) =>
    companyId ? sellers?.find((s) => s.spedy_company_id === companyId) ?? null : null;

  const colunas: Column<SpedyCompany>[] = [
    {
      header: "Empresa",
      cell: (c) => (
        <div className="min-w-0">
          <span className="block truncate text-strong">{c.name ?? c.legalName ?? "—"}</span>
          {c.legalName && c.legalName !== c.name && (
            <span className="block truncate t-caption">{c.legalName}</span>
          )}
        </div>
      ),
    },
    {
      header: "CNPJ",
      width: "12rem",
      cell: (c) => <span className="font-mono text-[0.75rem]">{formatarCnpj(c.federalTaxNumber)}</span>,
    },
    {
      header: "Seller",
      width: "16rem",
      cell: (c) => {
        // Sem a lista carregada não há veredito: um traço diz "ainda não sei",
        // e é honesto. "sem vínculo" seria uma acusação sem apuração.
        if (carregandoSellers) return <Skeleton className="h-4 w-40" />;
        if (erroSellers) return <span className="text-subtle">não foi possível conferir</span>;

        const s = sellerDe(c.id);
        return s ? (
          <span className="block truncate text-subtle" title={s.email ?? undefined}>
            {s.email ?? s.razao_social ?? s.user_id}
          </span>
        ) : (
          // Empresa que existe na Spedy e nenhum seller nosso reivindica. É
          // exatamente o caso que trava o cadastro do CNPJ.
          <Status tone="warning">sem vínculo</Status>
        );
      },
    },
    {
      header: "ID",
      width: "20rem",
      cell: (c) => <span className="font-mono text-[0.6875rem] text-subtle">{c.id ?? "—"}</span>,
    },
    {
      header: "",
      align: "right",
      width: "8rem",
      cell: (c) => (
        <RowActions>
          <Button size="sm" variant="outline" onClick={() => setSelecionada(c)}>
            Abrir
          </Button>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Empresas na Spedy"
        description="Empresas cadastradas na conta e o ambiente de emissão de cada uma. Produção e sandbox são contas separadas."
        meta={data && <span className="t-overline">{data.total}</span>}
      />

      <Toolbar>
        <Segmented
          value={sandbox ? "sandbox" : "prod"}
          options={[
            { value: "prod", label: "Produção" },
            { value: "sandbox", label: "Sandbox" },
          ]}
          onChange={(v) => {
            setSandbox(v === "sandbox");
            // A empresa aberta é de outra conta: mantê-la na tela mostraria
            // dados de uma base consultando a outra.
            setSelecionada(null);
          }}
        />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por CNPJ"
          className="max-w-[16rem]"
        />
        <Button size="sm" variant="outline" loading={isFetching} onClick={() => refetch()}>
          <RefreshCw /> Atualizar
        </Button>
      </Toolbar>

      <DataTable
        rows={empresas}
        rowKey={(c) => String(c.id)}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        empty={{
          title: alvo ? "Nenhuma empresa com esse CNPJ" : "Nenhuma empresa nesta conta",
          description: sandbox
            ? "Esta é a conta de sandbox da Spedy, separada da de produção."
            : "As empresas são criadas pelo cadastro fiscal do seller no TikTally.",
          icon: <Building2 />,
        }}
        columns={colunas}
      />

      {selecionada && (
        <DetalheEmpresa empresa={selecionada} sandbox={sandbox} onClose={() => setSelecionada(null)} />
      )}
    </div>
  );
}

function DetalheEmpresa({
  empresa,
  sandbox,
  onClose,
}: {
  empresa: SpedyCompany;
  sandbox: boolean;
  onClose: () => void;
}) {
  const id = empresa.id ?? undefined;
  const { data: settings, isLoading } = useSpedyCompanySettings(id, sandbox);
  const { data: certs } = useSpedyCompanyCertificates(id, sandbox);
  const trocar = useSetCompanyEnvironment();
  const excluir = useDeleteCompany();
  const [confirmando, setConfirmando] = useState(false);

  const ambiente = settings?.productInvoice.environmentType ?? null;
  const cert = certs?.certificates?.find((c) => c.isActive) ?? certs?.certificates?.[0] ?? null;

  return (
    <Panel
      title={`${empresa.name ?? empresa.legalName ?? "Empresa"} · ${formatarCnpj(empresa.federalTaxNumber)}`}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="danger" onClick={() => setConfirmando(true)}>
            <Trash2 /> Excluir empresa
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <InfoGrid cols={4}>
          <Info label="ID da empresa" value={<span className="font-mono text-[0.6875rem]">{empresa.id}</span>} />
          <Info label="Série da NF-e" value={isLoading ? "…" : settings?.productInvoice.series ?? "—"} />
          <Info label="Próximo número" value={isLoading ? "…" : settings?.productInvoice.nextNumber ?? "—"} />
          <Info
            label="Certificado A1"
            value={
              cert ? (
                <Status tone={cert.isActive ? "success" : "danger"}>
                  {cert.expirationAt
                    ? `vence ${new Date(cert.expirationAt).toLocaleDateString("pt-BR")}`
                    : cert.isActive
                      ? "ativo"
                      : "inativo"}
                </Status>
              ) : (
                "—"
              )
            }
          />
        </InfoGrid>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="t-label">Ambiente da NF-e</span>
            {ambiente && <Status tone={AMBIENTE[ambiente].tone}>{AMBIENTE[ambiente].label}</Status>}
          </div>

          <Segmented
            value={ambiente ?? "production"}
            options={[
              { value: "production", label: "Produção" },
              { value: "development", label: "Homologação" },
              { value: "simulation", label: "Simulação" },
            ]}
            onChange={(v) => {
              if (!id || v === ambiente) return;
              trocar.mutate({ companyId: id, sandbox, environmentType: v as SpedyEnvironmentType });
            }}
          />

          <Note tone="warning">
            Em <strong>produção</strong> a nota vai pra SEFAZ e vale de verdade: numeração consumida,
            cancelamento sujeito a prazo. <strong>Homologação</strong> emite sem valor fiscal, e é o
            que serve pra loja de teste da TikTok. Sem isso, um pedido de sandbox gera nota real.
            Trocar o ambiente não apaga nem invalida o que já foi emitido.
          </Note>
        </div>
      </div>

      {confirmando && id && (
        <ExcluirEmpresa
          empresa={empresa}
          pendente={excluir.isPending}
          onClose={() => setConfirmando(false)}
          onConfirm={(cnpj) =>
            excluir.mutate(
              { companyId: id, sandbox, confirmCnpj: cnpj },
              { onSuccess: () => { setConfirmando(false); onClose(); } }
            )
          }
        />
      )}
    </Panel>
  );
}

/**
 * Confirmação de exclusão com o CNPJ digitado à mão.
 *
 * Não é cerimônia: a ação é irreversível (a chave da empresa não volta), atinge
 * o cadastro fiscal de um seller que não está aqui pra opinar, e a lista mistura
 * empresas de teste com a real. Digitar o CNPJ obriga a olhar QUAL linha está
 * selecionada antes de confirmar.
 */
function ExcluirEmpresa({
  empresa,
  pendente,
  onConfirm,
  onClose,
}: {
  empresa: SpedyCompany;
  pendente: boolean;
  onConfirm: (cnpj: string) => void;
  onClose: () => void;
}) {
  const [digitado, setDigitado] = useState("");
  const esperado = soDigitos(empresa.federalTaxNumber);
  const confere = esperado.length > 0 && soDigitos(digitado) === esperado;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Excluir empresa na Spedy"
      className="max-w-[30rem]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pendente}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={pendente}
            disabled={!confere}
            onClick={() => onConfirm(digitado)}
          >
            Excluir
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="t-body leading-relaxed">
          <strong>{empresa.name ?? empresa.legalName}</strong> será removida da Spedy. A chave da
          empresa morre junto e não é recuperável: pra emitir de novo, o seller precisa cadastrar o
          CNPJ do zero, com certificado.
        </p>
        <Note tone="warning">
          As notas já emitidas continuam válidas na SEFAZ. O que se perde é a capacidade de emitir,
          consultar e cancelar por aqui. Se algum seller estiver vinculado, o cadastro fiscal dele
          volta ao estado inicial e a emissão automática é desligada.
        </Note>
        <Field label={`Digite o CNPJ ${formatarCnpj(empresa.federalTaxNumber)} para confirmar`}>
          <Input
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            placeholder="somente números ou com máscara"
            autoFocus
          />
        </Field>
      </div>
    </Dialog>
  );
}
