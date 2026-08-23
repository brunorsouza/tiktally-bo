/**
 * ============================================================================
 * Componentes do Design System
 * ============================================================================
 * Cada um existe porque o padrão estava COPIADO em várias telas. A regra: se
 * apareceu 3 vezes, vira componente. É isso que impede a interface de derivar
 * — não a boa vontade de quem escrever a próxima tela.
 *
 * A linguagem é a do LIVRO-RAZÃO: régua no lugar de caixa, serifa no título,
 * mono no número, acento quase nunca.
 */
import type { ReactNode, HTMLAttributes } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export { ColumnChart, ChartLegend } from "./ColumnChart";
export type { ColumnDatum, ChartTone } from "./ColumnChart";

/* ── Superfície ────────────────────────────────────────────────────────────
   A FOLHA. No claro ela é mais clara que a mesa; no escuro, mais clara que o
   fundo. Nos dois casos a leitura é a mesma: um documento pousado, não um
   cartão flutuando. Separação por elevação, não por borda em tudo. */
export function Surface({
  className,
  inset = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface-1 shadow-2",
        inset && "border-transparent bg-transparent shadow-none",
        className
      )}
      {...props}
    />
  );
}

/* ── Cabeçalho de página ───────────────────────────────────────────────────
   Sem régua embaixo: nesta linguagem o que separa o cabeçalho do conteúdo é o
   ESPAÇO e o cartão que vem logo abaixo — riscar a página com um fio a mais só
   endurece a tela. */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  eyebrow,
  titleClassName,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Chips/contadores ao lado do título. */
  meta?: ReactNode;
  /** Seção acima do título — a "pasta" onde a tela vive. */
  eyebrow?: ReactNode;
  /** Escape para o caso em que o título É dado (um código de cupom, p.ex.) e
   *  precisa da voz do mono em vez da serifa. */
  titleClassName?: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <p className="t-overline mb-2">{eyebrow}</p>}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className={cn("t-display", titleClassName)}>{title}</h1>
          {meta}
        </div>
        {description && <p className="t-caption mt-1.5 max-w-2xl leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5 pb-0.5">{actions}</div>}
    </header>
  );
}

/* ── Volta ────────────────────────────────────────────────────────────────
   Telas de detalhe tinham dois jeitos de voltar (link com seta e botão-ícone).
   Um só, discreto: navegação não disputa atenção com o conteúdo. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-1.5 text-[0.75rem] text-subtle transition-colors duration-ds ease-ds hover:text-strong"
    >
      <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-ds ease-ds group-hover:-translate-x-0.5" />
      {children}
    </Link>
  );
}

/* ── Grade de dados ───────────────────────────────────────────────────────
   Rótulo em cima, valor embaixo. Duas telas de detalhe tinham o mesmo
   componente com nomes diferentes (`Info` e `Field`) — e `Field` colidia com
   o campo de formulário. */
export function InfoGrid({ cols = 4, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={cn("grid grid-cols-2 gap-x-6 gap-y-4", grid)}>{children}</div>;
}

export function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  /** Valor, data, id, chave, documento — tudo que é DADO vai em mono tabular. */
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="t-overline">{label}</p>
      <p className={cn("mt-1.5 break-words text-[0.8125rem] leading-snug text-strong", mono && "tabular")}>
        {value ?? "—"}
      </p>
    </div>
  );
}

/* ── Bloco de código / JSON ───────────────────────────────────────────────── */
export function CodeBlock({ value, maxHeight = "20rem" }: { value: unknown; maxHeight?: string }) {
  return (
    <pre
      style={{ maxHeight }}
      className="overflow-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-[0.6875rem] leading-relaxed text-ink"
    >
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

/* ── Barra de filtros ─────────────────────────────────────────────────────
   Antes: um `<Card>` inteiro só pra segurar 3 filtros. Vira uma faixa. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

/* ── Métrica ──────────────────────────────────────────────────────────────
   O número é o herói: mono, tabular, com rótulo discreto acima. Sem a régua
   vertical que separava as colunas no tema anterior — aqui quem agrupa é o
   cartão em volta, e um fio a mais dentro dele vira ruído. */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "brand";
  icon?: ReactNode;
}) {
  const toneCls = {
    default: "text-strong",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    brand: "text-brand",
  }[tone];

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <p className="t-overline">{label}</p>
        {icon && <span className="text-subtle [&_svg]:h-3 [&_svg]:w-3">{icon}</span>}
      </div>
      <p className={cn("t-metric mt-2.5", toneCls)}>{value}</p>
      {hint && <p className="t-caption mt-2">{hint}</p>}
    </div>
  );
}

/* ── Grade de métricas ────────────────────────────────────────────────────
   UM cartão com todos os números dentro — não um cartão por número.

   A diferença importa: cartão por métrica é o que transforma a tela em mural
   de widgets, com quatro sombras competindo. Agrupados, os números se leem
   como uma linha de fechamento. */
export function StatGrid({ cols = 4, children }: { cols?: 3 | 4 | 5; children: ReactNode }) {
  const grid = {
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-3 lg:grid-cols-5",
  }[cols];
  return (
    <div className="rounded-lg border border-line bg-surface-1 px-6 py-5 shadow-2">
      <div className={cn("grid grid-cols-2 gap-x-6 gap-y-6", grid)}>{children}</div>
    </div>
  );
}

/* ── Painel ───────────────────────────────────────────────────────────────
   Bloco de conteúdo com título, em CARTÃO branco.

   Na versão anterior era uma seção "nua" com régua — coerente com o razão
   impresso, incoerente aqui: nesta linguagem o que agrupa é o cartão, e um
   bloco sem cartão fica boiando no fundo azul sem pertencer a nada. */
export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-line bg-surface-1 px-5 py-5 shadow-2", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-strong">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* ── Ficha ────────────────────────────────────────────────────────────────
   Bloco de configuração com cabeçalho preso: faixa rebaixada com o rótulo e a
   ação, corpo na folha. É a mesma anatomia do diálogo — e não por acaso: nos
   dois casos a pessoa está PREENCHENDO algo, e a aba presa em cima diz do que
   se trata sem virar mais uma caixa dentro da caixa.

   Existia copiado em Planos & Preços, Cupons e Empresas, cada um com um
   título de peso diferente. */
export function Fieldset({
  title,
  icon,
  description,
  actions,
  accent,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Régua colorida na borda esquerda — pra ficha que está VALENDO agora. */
  accent?: "warning" | "danger" | "brand" | "success";
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const risco = accent
    ? {
        warning: "border-l-2 border-l-warning",
        danger: "border-l-2 border-l-danger",
        brand: "border-l-2 border-l-brand",
        success: "border-l-2 border-l-success",
      }[accent]
    : undefined;

  return (
    <section className={cn("overflow-hidden rounded-lg border border-line bg-surface-1 shadow-2", risco, className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="t-overline flex items-center gap-1.5 text-[hsl(var(--text))] [&_svg]:h-3.5 [&_svg]:w-3.5">
            {icon}
            {title}
          </h2>
          {description && <p className="t-caption mt-1.5 max-w-2xl leading-relaxed">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      <div className={cn("px-5 py-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ── Controle segmentado ──────────────────────────────────────────────────
   Seletor de período. Estava com marcação própria em 2 telas. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="inline-flex rounded-pill border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-pill px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em]",
            "transition-colors duration-ds ease-ds",
            value === o.value
              ? "bg-surface-1 text-strong shadow-1"
              : "text-subtle hover:text-strong"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Campo de formulário ──────────────────────────────────────────────────
   Estava definido 4 VEZES em arquivos diferentes (cada tela com o seu). */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="t-overline mb-1.5 block">{label}</span>
      {children}
      {error ? (
        <span className="t-caption mt-1.5 block text-danger">{error}</span>
      ) : hint ? (
        <span className="t-caption mt-1.5 block">{hint}</span>
      ) : null}
    </label>
  );
}

/* ── Nota ─────────────────────────────────────────────────────────────────
   As caixinhas de "como essa regra funciona" estavam com 4 marcações
   diferentes. Régua na esquerda em vez de caixa: informa sem competir com o
   formulário — e sem acender um retângulo colorido do lado do campo. */
export function Note({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "brand" | "warning" | "danger";
  children: ReactNode;
  className?: string;
}) {
  const linha = {
    neutral: "border-line-strong",
    brand: "border-brand",
    warning: "border-warning",
    danger: "border-danger",
  }[tone];

  return (
    <div
      className={cn(
        "border-l-2 pl-3 text-[0.75rem] leading-relaxed text-subtle",
        linha,
        tone === "danger" && "text-danger",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ── Caixa de marcar ──────────────────────────────────────────────────────
   O checkbox nativo ignora o tema e sai cinza-sistema. Aqui o input real fica
   invisível (mas presente: foco por teclado, leitor de tela) e o quadrado
   visível é desenhado por CSS via `peer`. */
export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex select-none items-start gap-2.5",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"
      )}
    >
      <span className="relative flex h-[1.125rem] items-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border border-line-strong bg-surface-1",
            "transition-colors duration-ds ease-ds",
            "peer-checked:border-brand peer-checked:bg-brand",
            "peer-focus-visible:border-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/30"
          )}
        >
          <Check
            className={cn(
              "h-2.5 w-2.5 text-brand-foreground transition-opacity duration-ds ease-ds",
              checked ? "opacity-100" : "opacity-0"
            )}
            strokeWidth={3.5}
          />
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-[0.8125rem] text-strong">{label}</span>
        {hint && <span className="t-caption mt-0.5 block">{hint}</span>}
      </span>
    </label>
  );
}

/* ── Interruptor ──────────────────────────────────────────────────────────
   Diferente do Checkbox de propósito: checkbox é "marque o que se aplica" num
   formulário que ainda vai ser salvo; o interruptor é um estado LIGADO/
   DESLIGADO que vale na hora. Usar o componente certo é o que faz a pessoa
   entender que o clique já teve efeito. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
  busy,
  tone = "brand",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  /** `danger` para ligar algo que custa dinheiro ou abre acesso. */
  tone?: "brand" | "danger";
}) {
  const ligado = tone === "danger" ? "bg-danger border-danger" : "bg-brand border-brand";

  return (
    <label
      className={cn(
        "flex items-start gap-3",
        disabled || busy ? "cursor-not-allowed opacity-55" : "cursor-pointer"
      )}
    >
      <span className="relative flex h-5 items-center">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled || busy}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            "flex h-[1.125rem] w-8 shrink-0 items-center rounded-full border px-[2px]",
            "transition-colors duration-ds ease-ds",
            checked ? ligado : "border-line-strong bg-surface-3",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-[hsl(var(--surface-1))]"
          )}
        >
          <span
            className={cn(
              "h-3 w-3 rounded-full bg-surface-1 shadow-1 transition-transform duration-ds ease-ds",
              checked ? "translate-x-[0.875rem]" : "translate-x-0"
            )}
          />
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-[0.8125rem] font-medium text-strong">{label}</span>
        {hint && <span className="t-caption mt-0.5 block leading-relaxed">{hint}</span>}
      </span>
    </label>
  );
}

/* ── Chip selecionável ────────────────────────────────────────────────────
   Também estava duplicado em 2 telas. */
export function Chip({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "rounded-pill border px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em]",
        "transition-colors duration-ds ease-ds disabled:pointer-events-none disabled:opacity-40",
        active
          ? "border-brand bg-brand-muted text-brand"
          : "border-line-strong bg-surface-1 text-subtle hover:bg-surface-3 hover:text-strong"
      )}
    >
      {children}
    </button>
  );
}

/* ── Estado ───────────────────────────────────────────────────────────────
   Pastilha colorida: fundo da própria matiz + texto forte da mesma família.

   Substituiu o ponto de 5px com rótulo em tinta neutra. O ponto era discreto
   demais pro trabalho real: numa varredura de 50 linhas procurando o que deu
   errado, o olho acha bloco de cor — não acha um pixel cinza. Aqui o estado é
   o elemento mais legível da linha, que é exatamente o que ele deve ser numa
   fila de exceções. */
type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const pastilha: Record<Tone, string> = {
  neutral: "bg-surface-3 text-ink",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  info: "bg-info-surface text-info",
  brand: "bg-brand-muted text-brand",
};

export function Status({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-pill px-2.5 py-1",
        "text-[0.6875rem] font-semibold leading-none",
        pastilha[tone]
      )}
    >
      {children}
    </span>
  );
}

/* ── Selo ─────────────────────────────────────────────────────────────────
   Irmão do `Status`, em caixa-alta e menor: para rótulo de classificação
   (ambiente, plano, tipo) em vez de estado de fluxo. Mesmo mapa de cor — duas
   tabelas de tom acabariam divergindo. */
export function Tag({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-pill px-2 py-0.5",
        "text-[0.625rem] font-semibold uppercase tracking-[0.06em]",
        pastilha[tone]
      )}
    >
      {children}
    </span>
  );
}

/* ── Abas de estado ───────────────────────────────────────────────────────
   "Switch between the tabs of activity status displayed above" — o controle
   que substitui o `<select>` de status.

   A troca não é cosmética. Um seletor esconde DUAS informações que o operador
   precisa antes de filtrar: quais estados existem e quantos itens tem em cada
   um. Aqui a distribuição está na tela o tempo todo, e filtrar é um clique em
   vez de abrir-procurar-escolher. Numa fila de trabalho, "tem 4 rejeitadas"
   costuma ser a pergunta em si — não o caminho até ela. */
export function StatusChips<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string; count?: number; tone?: Tone }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {options.map((o) => {
        const ativo = value === o.value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={ativo}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[0.75rem]",
              "transition-colors duration-ds ease-ds",
              ativo
                ? "bg-surface-1 font-semibold text-strong shadow-1"
                : "text-subtle hover:bg-surface-1 hover:text-strong"
            )}
          >
            {o.label}
            {/* A contagem é um badge da cor do estado — a distribuição fica
                legível sem precisar ler número por número. */}
            {o.count !== undefined && (
              <span
                className={cn(
                  "tabular rounded-pill px-1.5 py-px text-[0.625rem] font-semibold leading-[1.3]",
                  pastilha[o.tone ?? "neutral"]
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Vazio ────────────────────────────────────────────────────────────────
   Estado vazio com AÇÃO, não só "nenhum item encontrado". */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-2 text-subtle [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </div>
      )}
      <p className="t-title">{title}</p>
      {description && <p className="t-body mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ── Erro ─────────────────────────────────────────────────────────────────── */
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="t-title text-danger">Não foi possível carregar</p>
      <p className="t-caption mx-auto mt-1.5 max-w-md leading-relaxed">{message}</p>
    </div>
  );
}

/* ── Esqueleto ────────────────────────────────────────────────────────────
   Placeholder com a forma do conteúdo — menos "pulo" que spinner. O brilho é
   uma faixa da cor da FOLHA, não branco: branco só funciona no escuro. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-sm bg-surface-2", className)}>
      {/* A faixa é o REALCE do tema: escurece no papel, clareia na tinta.
          Branco fixo só funciona no escuro — no claro some. */}
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-[hsl(var(--surface-3))] to-transparent" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line/60 px-3 py-3 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-3", c === 0 ? "w-32" : "w-16", c === cols - 1 && "ml-auto")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Paginação ────────────────────────────────────────────────────────────
   Contagem à esquerda, navegação à direita. A contagem vem primeiro porque
   "quantos resultados" é a pergunta mais frequente — não "qual página". */
export function Pagination({
  page,
  totalPages,
  total,
  unit,
  fetching,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  /** Palavra no plural: "resgates", "notas". */
  unit: string;
  fetching?: boolean;
  onPage: (p: number) => void;
}) {
  const paginas = Math.max(1, totalPages);

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="t-caption">
        <span className="tabular text-strong">{total}</span> {unit}
        {fetching && <span className="ml-2 animate-pulse">atualizando…</span>}
      </p>
      <div className="flex items-center gap-1.5">
        <Button size="icon-sm" variant="outline" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>
          <ChevronLeft />
        </Button>
        <span className="t-caption tabular px-1">
          {page} / {paginas}
        </span>
        <Button size="icon-sm" variant="outline" disabled={page >= paginas} onClick={() => onPage(page + 1)}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/* ── Dinheiro ─────────────────────────────────────────────────────────────
   Sempre à direita, sempre tabular. Em coluna financeira é isso que faz o
   olho comparar ordem de grandeza sem ler dígito por dígito. */
export function Money({
  cents,
  className,
  tone,
}: {
  cents: number | null | undefined;
  className?: string;
  tone?: "success" | "danger" | "muted";
}) {
  const toneCls =
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "muted" ? "text-subtle" : "";
  return (
    <span className={cn("tabular whitespace-nowrap", toneCls, className)}>
      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100)}
    </span>
  );
}
