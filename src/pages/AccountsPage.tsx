/**
 * Contas e ambiente de emissão.
 *
 * Uma linha por CONTA, com o ambiente da Spedy trocável ali mesmo. É a
 * pergunta que se faz na prática ("essa conta emite nota de verdade?"), e ela
 * não é respondível pela tela de Empresas, que lista pelo lado da Spedy e nem
 * sempre sabe de quem é cada empresa.
 *
 * Diferente de Sellers, que parte do `fiscal_configs` e só enxerga quem já
 * cadastrou o CNPJ. Aqui conta sem cadastro aparece igual, porque "não tem
 * empresa na Spedy" é uma resposta e some da tela se a linha não existir.
 *
 * O ambiente vem de uma chamada em lote (`companies_environments`): uma
 * requisição pra todas as empresas, em vez de uma por linha.
 */
import { useMemo, useState } from "react";
import { Users, FlaskConical, RefreshCw, UserPlus, Copy, Check, Dices, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import {
  PageHeader,
  Segmented,
  Field,
  Note,
  Skeleton,
  Status,
} from "@/components/ds";
import { DataTable, CellStack, type Column } from "@/components/ds/DataTable";
import { useToast } from "@/components/ui/toast";
import { formatCnpj, formatDate, formatRelative } from "@/lib/formatters";
import { cnpjValido, cpfValido, gerarSenha, maskCnpj, maskCpf, soDigitos } from "@/lib/documents";
import {
  useAccounts,
  useCreateAccount,
  useEnvironments,
  usePlans,
  useSetAccountEnvironment,
  useSetAccountPlan,
} from "@/hooks/useAccounts";
import type { BoAccount, BoPlan, SpedyEnvironmentType } from "@/types";

/** Valor de fábrica do gatilho de signup — na prática, "sem plano escolhido". */
const PLANO_NEUTRO = "tiktally";

const STATUS_LABEL: Record<string, string> = {
  active: "ativa",
  trial: "teste",
  expired: "expirada",
  cancelled: "cancelada",
  pending: "pendente",
};

const AMBIENTE: Record<
  SpedyEnvironmentType,
  { label: string; tone: "success" | "warning" | "neutral" }
> = {
  production: { label: "produção", tone: "success" },
  development: { label: "homologação", tone: "warning" },
  simulation: { label: "simulação", tone: "neutral" },
};

export function AccountsPage() {
  const [busca, setBusca] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const [editando, setEditando] = useState<BoAccount | null>(null);
  const { data: contas, isLoading, error, refetch, isFetching } = useAccounts();
  const { data: planos } = usePlans();

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return contas ?? [];
    return (contas ?? []).filter((c) =>
      [c.email, c.shop_name, c.razao_social, c.cnpj]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [contas, busca]);

  /**
   * As empresas em PRODUÇÃO da Spedy. Contas marcadas como sandbox ficam de
   * fora do lote: sandbox e produção são contas separadas na Spedy, e pedir a
   * empresa de uma na base da outra volta 404. Elas são tratadas na linha.
   */
  const idsProducao = useMemo(
    () =>
      (contas ?? [])
        .filter((c) => c.spedy_company_id && !c.spedy_use_sandbox)
        .map((c) => c.spedy_company_id as string),
    [contas],
  );

  const { data: ambientes, isLoading: carregandoAmbientes } = useEnvironments(idsProducao, false);
  const definir = useSetAccountEnvironment();

  const colunas: Column<BoAccount>[] = [
    {
      header: "Conta",
      cell: (c) => (
        <div className="flex items-center gap-1.5">
          <CellStack title={c.shop_name || c.razao_social || "—"} subtitle={c.email ?? ""} />
          {c.spedy_use_sandbox && (
            <FlaskConical className="h-3 w-3 shrink-0 text-warning" aria-label="sandbox" />
          )}
        </div>
      ),
    },
    {
      header: "CNPJ",
      width: "11rem",
      hideBelow: "md",
      cell: (c) =>
        c.cnpj ? (
          <span className="tabular whitespace-nowrap text-subtle">{formatCnpj(c.cnpj)}</span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      header: "Plano",
      width: "12rem",
      cell: (c) => <CelulaPlano conta={c} planos={planos} onEditar={() => setEditando(c)} />,
    },
    {
      header: "Renovação",
      width: "9rem",
      hideBelow: "md",
      cell: (c) => <CelulaRenovacao conta={c} />,
    },
    {
      header: "Emissão",
      width: "7rem",
      hideBelow: "lg",
      cell: (c) =>
        // Automático com ambiente de produção é a combinação que emite nota
        // real sozinha. O modo fica visível ao lado do ambiente porque um só
        // dos dois não conta a história.
        c.emission_mode === "automatic" ? (
          <Status tone="warning">automática</Status>
        ) : c.emission_mode ? (
          <Status tone="neutral">manual</Status>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      header: "Ambiente da NF-e",
      width: "17rem",
      cell: (c) => (
        <CelulaAmbiente
          conta={c}
          ambientes={ambientes}
          carregando={carregandoAmbientes}
          definir={definir}
        />
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Fiscal"
        title="Contas e ambiente"
        description="Todas as contas do sistema e o ambiente de emissão de cada uma na Spedy."
        meta={contas && <span className="t-overline">{contas.length}</span>}
      />

      <Note tone="warning">
        Em <strong>produção</strong> a nota vai pra SEFAZ e vale de verdade. Em{" "}
        <strong>homologação</strong> ela é emitida sem valor fiscal, que é o que serve pra loja de
        teste da TikTok. Trocar o ambiente não apaga nem invalida o que já foi emitido, e vale a
        partir da próxima nota.
      </Note>

      <DataTable
        toolbar={
          <>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por e-mail, loja ou CNPJ"
              className="max-w-[22rem]"
            />
            <Button size="sm" variant="outline" loading={isFetching} onClick={() => refetch()}>
              <RefreshCw /> Atualizar
            </Button>
            <Button size="sm" onClick={() => setCadastrando(true)}>
              <UserPlus /> Nova conta
            </Button>
          </>
        }
        rows={filtradas}
        rowKey={(c) => c.user_id}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        empty={{
          title: busca ? "Nenhuma conta encontrada" : "Nenhuma conta",
          description: busca ? "Tente outro e-mail, loja ou CNPJ." : "",
          icon: <Users />,
        }}
        columns={colunas}
      />

      {cadastrando && <DialogoNovaConta onClose={() => setCadastrando(false)} />}
      {editando && <DialogoPlano conta={editando} onClose={() => setEditando(null)} />}
    </div>
  );
}

/* ── Plano e renovação ────────────────────────────────────────────────────
   Plano e status na mesma célula porque um sozinho engana: "ERP" numa
   assinatura cancelada não é um plano, é uma lembrança. */

function CelulaPlano({
  conta,
  planos,
  onEditar,
}: {
  conta: BoAccount;
  planos: BoPlan[] | undefined;
  onEditar: () => void;
}) {
  const ativo = conta.status === "active" || conta.status === "trial";
  const semPlano = !conta.plan || conta.plan === PLANO_NEUTRO;
  const nome = planos?.find((p) => p.key === conta.plan)?.name ?? conta.plan;

  return (
    <button
      type="button"
      onClick={onEditar}
      className="group -mx-1 flex items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-3"
      title="Alterar plano"
    >
      {semPlano ? (
        <span className="text-subtle">sem plano</span>
      ) : (
        <>
          <span className={ativo ? "text-strong" : "text-subtle line-through"}>{nome}</span>
          {!ativo && <Status tone="neutral">{STATUS_LABEL[conta.status ?? ""] ?? conta.status}</Status>}
        </>
      )}
      <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}

/**
 * A data sozinha não diz o que importa — o que importa é se já passou. Vencida
 * em vermelho, vencendo em 15 dias em amarelo, o resto neutro.
 */
function CelulaRenovacao({ conta }: { conta: BoAccount }) {
  if (!conta.current_period_end) return <span className="text-subtle">—</span>;

  const restante = new Date(conta.current_period_end).getTime() - Date.now();
  const tom =
    restante < 0 ? "text-danger" : restante < 15 * 864e5 ? "text-warning" : "text-subtle";

  return (
    <span className={`tabular ${tom}`} title={formatRelative(conta.current_period_end)}>
      {formatDate(conta.current_period_end)}
      {conta.cancel_at_period_end && <span className="t-caption block">cancela no fim</span>}
    </span>
  );
}

/**
 * Concessão manual de plano.
 *
 * Plano e prazo no MESMO diálogo porque não são duas decisões: plano sem data
 * seria acesso eterno e data sem plano não é nada. E "sem plano" é uma opção
 * do mesmo seletor, não um botão de remover à parte — tirar o acesso é a
 * mesma decisão, com outro valor.
 */
function DialogoPlano({ conta, onClose }: { conta: BoAccount; onClose: () => void }) {
  const { data: planos } = usePlans();
  const definir = useSetAccountPlan();

  const atual = !conta.plan || conta.plan === PLANO_NEUTRO ? "" : conta.plan;
  const [plano, setPlano] = useState(conta.status === "active" ? atual : "");
  const [ate, setAte] = useState(() => paraInputDate(conta.current_period_end) || emMeses(6));

  const futuro = !!ate && new Date(`${ate}T23:59:59`).getTime() > Date.now();

  return (
    <Dialog
      open
      onClose={onClose}
      title="Plano da conta"
      description={conta.email ?? conta.shop_name ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={definir.isPending}>
            Cancelar
          </Button>
          <Button
            variant={plano ? "primary" : "danger"}
            loading={definir.isPending}
            disabled={!!plano && !futuro}
            onClick={() =>
              definir.mutate(
                {
                  userId: conta.user_id,
                  plan: plano || null,
                  periodEnd: plano ? new Date(`${ate}T23:59:59`).toISOString() : null,
                },
                { onSuccess: onClose },
              )
            }
          >
            {plano ? "Salvar" : "Remover acesso"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Plano">
          <Select value={plano} onChange={(e) => setPlano(e.target.value)}>
            <option value="">Sem plano — assinatura cancelada</option>
            {(planos ?? []).map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
                {p.status === "test" ? " · teste" : ""}
              </option>
            ))}
          </Select>
        </Field>

        {plano && (
          <Field
            label="Acesso até"
            error={futuro ? undefined : "Escolha uma data futura."}
            hint="Vira a próxima renovação. Três dias depois disso a rotina expira sozinha."
          >
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </Field>
        )}

        {conta.gateway_managed ? (
          <Note tone="warning">
            Esta assinatura é dirigida pela <strong>Asaas</strong> (recorrência ou cartão salvo). A
            data definida aqui vale até o próximo webhook de pagamento, que sobrescreve. Pra
            encerrar de verdade, cancele pelo gateway.
          </Note>
        ) : (
          <Note>
            Concessão <strong>manual</strong>: libera o acesso sem criar cobrança na Asaas e não
            renova sozinha. No vencimento a conta volta pro paywall.
          </Note>
        )}
      </div>
    </Dialog>
  );
}

/** `YYYY-MM-DD` pro `<input type="date">`, que não aceita ISO com hora. */
function paraInputDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function emMeses(meses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

/**
 * Cadastro de conta.
 *
 * Os campos são os MESMOS do signup público (e-mail, senha, CNPJ, razão
 * social, CPF do responsável, nome fantasia) porque o cadastro é o mesmo — o
 * que muda é quem digita. Inventar um formulário mais curto aqui criaria conta
 * pela metade, que trava na primeira nota fiscal.
 *
 * A senha aparece em texto: quem cadastra precisa repassá-la, e um campo
 * mascarado que ninguém consegue ler obriga a "esqueci minha senha" logo no
 * primeiro acesso.
 */
function DialogoNovaConta({ onClose }: { onClose: () => void }) {
  const criar = useCreateAccount();
  const { data: planos } = usePlans();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState(() => gerarSenha());
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cpf, setCpf] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [loja, setLoja] = useState("");
  const [plano, setPlano] = useState("");
  const [ate, setAte] = useState(() => emMeses(6));
  const [copiada, setCopiada] = useState(false);
  // Erro só depois da primeira tentativa: campo vazio ainda não é campo errado.
  const [tentou, setTentou] = useState(false);

  const erros = {
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) ? null : "E-mail inválido",
    senha: senha.length >= 8 ? null : "Mínimo de 8 caracteres",
    cnpj: cnpjValido(cnpj) ? null : soDigitos(cnpj).length === 14 ? "Dígito verificador não confere" : "CNPJ incompleto",
    razaoSocial: razaoSocial.trim().length >= 3 ? null : "Mínimo de 3 caracteres",
    cpf: cpfValido(cpf) ? null : soDigitos(cpf).length === 11 ? "Dígito verificador não confere" : "CPF incompleto",
    ate: !plano || (ate && new Date(`${ate}T23:59:59`).getTime() > Date.now()) ? null : "Escolha uma data futura",
  };
  const valido = Object.values(erros).every((e) => e === null);
  const mostrar = (campo: keyof typeof erros) => (tentou ? erros[campo] : null);

  const copiarSenha = () => {
    navigator.clipboard?.writeText(senha);
    setCopiada(true);
    toast.success("Senha copiada", "Repasse por um canal privado.");
    setTimeout(() => setCopiada(false), 1500);
  };

  const enviar = () => {
    setTentou(true);
    if (!valido) return;
    criar.mutate(
      {
        email: email.trim(),
        password: senha,
        cnpj: soDigitos(cnpj),
        legalName: razaoSocial.trim(),
        legalCpf: soDigitos(cpf),
        companyName: nomeFantasia.trim() || null,
        shopName: loja.trim() || null,
        plan: plano || null,
        periodEnd: plano ? new Date(`${ate}T23:59:59`).toISOString() : null,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nova conta"
      description="Cria o acesso ao TikTally já com o cadastro fiscal."
      className="max-w-[34rem]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button onClick={enviar} loading={criar.isPending}>
            Criar conta
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="E-mail" error={mostrar("email")} hint="Vira o login. Já entra confirmado.">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@empresa.com.br"
            autoComplete="off"
          />
        </Field>

        <Field
          label="Senha inicial"
          error={mostrar("senha")}
          hint="Gerada ao abrir. Copie antes de criar — depois ela não é recuperável, só redefinível."
        >
          <div className="flex gap-2">
            <Input
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="font-mono"
              autoComplete="off"
            />
            <Button variant="outline" onClick={() => setSenha(gerarSenha())} title="Gerar outra">
              <Dices />
            </Button>
            <Button variant="outline" onClick={copiarSenha} title="Copiar">
              {copiada ? <Check /> : <Copy />}
            </Button>
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="CNPJ" error={mostrar("cnpj")}>
            <Input
              value={cnpj}
              onChange={(e) => setCnpj(maskCnpj(e.target.value))}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
            />
          </Field>

          <Field label="CPF do responsável" error={mostrar("cpf")}>
            <Input
              value={cpf}
              onChange={(e) => setCpf(maskCpf(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
          </Field>
        </div>

        <Field label="Razão social" error={mostrar("razaoSocial")}>
          <Input
            value={razaoSocial}
            onChange={(e) => setRazaoSocial(e.target.value)}
            placeholder="Empresa Comércio LTDA"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome fantasia" hint="Opcional.">
            <Input
              value={nomeFantasia}
              onChange={(e) => setNomeFantasia(e.target.value)}
              placeholder="Minha Loja"
            />
          </Field>

          <Field label="Nome da loja" hint="Opcional — só pra identificar aqui.">
            <Input value={loja} onChange={(e) => setLoja(e.target.value)} placeholder="Loja Centro" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plano" hint="Opcional — sem plano, a conta entra no paywall.">
            <Select value={plano} onChange={(e) => setPlano(e.target.value)}>
              <option value="">Sem plano</option>
              {(planos ?? []).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                  {p.status === "test" ? " · teste" : ""}
                </option>
              ))}
            </Select>
          </Field>

          {plano && (
            <Field label="Acesso até" error={mostrar("ate")}>
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </Field>
          )}
        </div>

        {plano ? (
          <Note>
            Concessão <strong>manual</strong>: a conta entra com acesso liberado, sem cobrança na
            Asaas. Não renova sozinha — no vencimento volta pro paywall.
          </Note>
        ) : (
          <Note tone="warning">
            A conta entra com a assinatura <strong>cancelada</strong>, igual a quem se cadastra
            sozinho: a pessoa consegue logar, mas o paywall segue de pé até o pagamento.
          </Note>
        )}
      </div>
    </Dialog>
  );
}

/**
 * O seletor de ambiente, nos dois estados da conta.
 *
 * ## Com empresa e sem empresa usam o MESMO controle
 * Quem tem empresa na Spedy vê o ambiente real dela, lido no lote, e a troca
 * vale na hora. Quem ainda não tem escolhe do mesmo jeito, e a escolha fica
 * guardada até o CNPJ ser cadastrado pelo TikTally — aí a empresa já nasce
 * assim, sem a janela entre cadastrar e trocar à mão, que é onde um pedido pago
 * virava NF-e real.
 *
 * A diferença aparece no rótulo (`ao cadastrar`), não na existência do
 * controle: esconder o seletor obrigaria a esperar o seller cadastrar pra só
 * então correr atrás do ambiente, que é exatamente o problema.
 */
function CelulaAmbiente({
  conta,
  ambientes,
  carregando,
  definir,
}: {
  conta: BoAccount;
  ambientes: ReturnType<typeof useEnvironments>["data"];
  carregando: boolean;
  definir: ReturnType<typeof useSetAccountEnvironment>;
}) {
  const temEmpresaEmProducao = !!conta.spedy_company_id && !conta.spedy_use_sandbox;
  const entrada = temEmpresaEmProducao
    ? ambientes?.environments?.[conta.spedy_company_id as string]
    : undefined;

  if (temEmpresaEmProducao && carregando) return <Skeleton className="h-8 w-48" />;

  // Empresa existe mas não deu pra ler o ambiente dela. Um seletor aqui
  // trocaria "não sei" por uma afirmação, e o clique seguinte gravaria em cima
  // de um estado que ninguém leu.
  if (temEmpresaEmProducao && (!entrada || entrada.erro)) {
    return (
      <span className="text-subtle" title={entrada?.erro ?? undefined}>
        não foi possível ler{entrada?.erro ? ` (${entrada.erro})` : ""}
      </span>
    );
  }

  // Com empresa, o valor mostrado é o que está NA SPEDY. Sem empresa, é a
  // escolha guardada. Nunca o contrário: a escolha não descreve uma empresa
  // que já existe, e o que está na Spedy não existe pra quem não cadastrou.
  const atual = temEmpresaEmProducao ? entrada?.environmentType ?? null : conta.spedy_environment;
  const mexendoNesta = definir.isPending && definir.variables?.userId === conta.user_id;

  // Empilhado, não lado a lado: a nota ("padrão da Spedy · conta em sandbox")
  // não cabe ao lado de um seletor de 3 posições e quebrava em quatro linhas,
  // desalinhando a linha inteira da tabela.
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Segmented
        value={atual ?? "production"}
        options={[
          { value: "production", label: "Produção" },
          { value: "development", label: "Homolog." },
          { value: "simulation", label: "Simul." },
        ]}
        onChange={(v) => {
          if (v === atual || mexendoNesta) return;
          definir.mutate({ userId: conta.user_id, environmentType: v as SpedyEnvironmentType });
        }}
      />

      {mexendoNesta ? (
        <span className="t-caption">salvando…</span>
      ) : temEmpresaEmProducao ? (
        atual && <Status tone={AMBIENTE[atual].tone}>{AMBIENTE[atual].label}</Status>
      ) : (
        // Sem empresa o seletor promete o futuro, não descreve o presente. O
        // rótulo tem que dizer isso, senão a linha parece já estar valendo.
        <span className="t-caption whitespace-nowrap">
          {conta.spedy_environment ? "ao cadastrar" : "padrão da Spedy"}
          {conta.spedy_use_sandbox && conta.spedy_company_id ? " · conta em sandbox" : ""}
        </span>
      )}
    </div>
  );
}
