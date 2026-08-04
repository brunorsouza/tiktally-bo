/**
 * ============================================================================
 * Componentes do Design System
 * ============================================================================
 * Cada um aqui existe porque o padrão estava COPIADO em várias telas. Regra:
 * se apareceu 3 vezes, vira componente. Isso é o que impede a interface de
 * derivar — não a boa vontade de quem escreve a próxima tela.
 */
import type { ReactNode, HTMLAttributes } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Superfície ────────────────────────────────────────────────────────────
   Substitui o `<Card>` genérico. A diferença de UX: separação por ELEVAÇÃO,
   não por borda em tudo. Menos "caixa dentro de caixa". */
export function Surface({
  className,
  inset = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border border-line bg-surface-1",
        inset && "bg-transparent",
        className
      )}
      {...props}
    />
  );
}

/* ── Cabeçalho de página ───────────────────────────────────────────────────
   Estava repetido em 7 telas com marcações levemente diferentes — a origem
   clássica da inconsistência. */
export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Chips/contadores ao lado do título. */
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2.5">
          <h1 className="t-display">{title}</h1>
          {meta}
        </div>
        {description && <p className="t-caption mt-1 max-w-2xl leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}

/* ── Volta ────────────────────────────────────────────────────────────────
   Telas de detalhe tinham dois jeitos de voltar (link com seta e botão-ícone).
   Um só, e discreto: navegação não disputa atenção com o conteúdo. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-[0.75rem] text-subtle transition-colors duration-ds ease-ds hover:text-strong"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
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
  return <div className={cn("grid grid-cols-2 gap-x-5 gap-y-4", grid)}>{children}</div>;
}

export function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="t-overline">{label}</p>
      <p className="mt-1 break-words text-[0.8125rem] text-strong">{value ?? "—"}</p>
    </div>
  );
}

/* ── Bloco de código / JSON ───────────────────────────────────────────────── */
export function CodeBlock({ value, maxHeight = "20rem" }: { value: unknown; maxHeight?: string }) {
  return (
    <pre
      style={{ maxHeight }}
      className="overflow-auto rounded-md border border-line bg-surface-1 p-3 font-mono text-[0.6875rem] leading-relaxed text-subtle"
    >
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

/* ── Barra de filtros ─────────────────────────────────────────────────────
   Antes: um `<Card>` inteiro só pra segurar 3 filtros. Vira uma faixa. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
  );
}

/* ── Métrica ──────────────────────────────────────────────────────────────
   O número é o herói: grande, tabular, com rótulo discreto acima. */
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
    brand: "text-brand-strong",
  }[tone];

  return (
    <div className="border-l border-line pl-3.5">
      <div className="flex items-center gap-1.5">
        <p className="t-overline">{label}</p>
        {icon && <span className="text-subtle [&_svg]:h-3 [&_svg]:w-3">{icon}</span>}
      </div>
      <p className={cn("t-metric mt-2", toneCls)}>{value}</p>
      {hint && <p className="t-caption mt-1.5">{hint}</p>}
    </div>
  );
}

/* ── Grade de métricas ────────────────────────────────────────────────────
   Métricas lado a lado separadas só pela régua do `Stat` — sem um cartão
   por número. Era isso que fazia o dashboard parecer um mural de widgets. */
export function StatGrid({ cols = 4, children }: { cols?: 3 | 4 | 5; children: ReactNode }) {
  const grid = { 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5" }[cols];
  return <div className={cn("grid grid-cols-2 gap-y-5", grid)}>{children}</div>;
}

/* ── Painel com título ────────────────────────────────────────────────────
   Substitui Card + CardHeader + CardTitle. O título é uma faixa, não outra
   caixa aninhada. */
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
    <section className={cn("min-w-0", className)}>
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-2">
        <h2 className="t-label">{title}</h2>
        {actions}
      </div>
      {children}
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
    <div role="tablist" className="inline-flex rounded-md border border-line p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[0.3125rem] px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider",
            "transition-colors duration-ds ease-ds",
            value === o.value ? "bg-surface-3 text-strong" : "text-subtle hover:text-strong"
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
      <span className="t-label mb-1.5 block">{label}</span>
      {children}
      {error ? (
        <span className="t-caption mt-1 block text-danger">{error}</span>
      ) : hint ? (
        <span className="t-caption mt-1 block">{hint}</span>
      ) : null}
    </label>
  );
}

/* ── Nota ─────────────────────────────────────────────────────────────────
   As caixinhas de "como essa regra funciona" estavam com 4 marcações
   diferentes. Régua na esquerda em vez de caixa: informa sem competir com o
   formulário. */
export function Note({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "brand" | "warning";
  children: ReactNode;
  className?: string;
}) {
  const linha = {
    neutral: "border-line-strong",
    brand: "border-brand",
    warning: "border-warning",
  }[tone];

  return (
    <div className={cn("border-l-2 pl-3 text-[0.75rem] leading-relaxed text-subtle", linha, className)}>
      {children}
    </div>
  );
}

/* ── Caixa de marcar ──────────────────────────────────────────────────────
   O checkbox nativo ignora o tema e sai cinza-sistema no escuro. Aqui o
   input real fica invisível (mas presente: foco por teclado, leitor de tela)
   e o quadrado visível é desenhado por CSS via `peer`. */
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
      <span className="relative flex h-4 items-center">
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
            "peer-focus-visible:border-brand peer-focus-visible:ring-1 peer-focus-visible:ring-brand"
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
        "rounded-md border px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider transition-colors duration-ds ease-ds",
        "disabled:pointer-events-none disabled:opacity-40",
        active
          ? "border-brand bg-brand-muted text-brand-strong"
          : "border-line-strong text-subtle hover:bg-surface-3 hover:text-strong"
      )}
    >
      {children}
    </button>
  );
}

/* ── Estado (badge) ───────────────────────────────────────────────────────
   Ponto + rótulo. O ponto carrega a cor; o texto continua legível — melhor
   que texto colorido em fundo colorido, que sempre cai de contraste. */
type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

export function Status({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const dot = {
    neutral: "bg-subtle",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
    brand: "bg-brand",
  }[tone];

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.75rem] font-medium text-[hsl(var(--text))]">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
      {children}
    </span>
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
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 text-subtle [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </div>
      )}
      <p className="t-title">{title}</p>
      {description && <p className="t-body mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ── Erro ─────────────────────────────────────────────────────────────────── */
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="t-title text-danger">Não foi possível carregar</p>
      <p className="t-caption mx-auto mt-1 max-w-md">{message}</p>
    </div>
  );
}

/* ── Esqueleto ────────────────────────────────────────────────────────────
   Placeholder com forma do conteúdo — menos "pulo" que spinner. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded bg-surface-3", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-px">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
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
    <div className="flex items-center justify-between border-t border-line pt-3">
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
   Sempre à direita, sempre tabular. Em coluna financeira isso é o que faz o
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
