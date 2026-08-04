/**
 * ============================================================================
 * Componentes do Design System
 * ============================================================================
 * Cada um aqui existe porque o padrão estava COPIADO em várias telas. Regra:
 * se apareceu 3 vezes, vira componente. Isso é o que impede a interface de
 * derivar — não a boa vontade de quem escreve a próxima tela.
 */
import type { ReactNode, HTMLAttributes } from "react";
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
        "rounded-sm border px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-wider transition-colors duration-ds ease-ds",
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
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-[1px]", dot)} />
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
