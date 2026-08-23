import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Botão do DS.
 *
 * Hierarquia deliberada: numa tela de trabalho quase tudo é `ghost`/`outline`,
 * e `primary` marca A ação principal — uma por tela. Se duas coisas gritam,
 * nada grita. É também o único lugar onde o violeta da marca aparece cheio.
 *
 * Formato pílula, como na referência. Estados são explícitos em vez de
 * `opacity-90`: ao pressionar, o botão "afunda" 1px. Esse retorno tátil é o
 * que dá sensação de ferramenta.
 *
 * O hover das variantes preenchidas ESCURECE no papel e CLAREIA na tinta —
 * `brightness-110` fixo clareia nos dois, e no claro isso lê como "apagou".
 */
type Variant = "primary" | "outline" | "ghost" | "subtle" | "danger" | "success" | "default" | "destructive";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Ocupa a largura do contêiner. */
  block?: boolean;
}

const primary =
  "border border-transparent bg-brand text-brand-foreground shadow-2 " +
  "hover:bg-brand-strong active:translate-y-px";

const preenchido = "border border-transparent shadow-2 hover:brightness-95 dark:hover:brightness-110 active:translate-y-px";

const variants: Record<Variant, string> = {
  primary,
  default: primary, // alias legado
  // Contorno na MARCA, não em cinza: na referência a ação secundária ainda é
  // uma ação — ela se lê como botão, não como campo desabilitado.
  outline:
    "border border-brand/35 bg-surface-1 text-brand shadow-1 hover:border-brand hover:bg-brand-muted active:translate-y-px",
  ghost:
    "border border-transparent bg-transparent text-subtle hover:border-line hover:bg-surface-3 hover:text-strong active:translate-y-px",
  subtle: "border border-line bg-surface-3 text-strong hover:border-line-strong hover:brightness-[0.98] dark:hover:brightness-110 active:translate-y-px",
  danger: cn(preenchido, "bg-danger text-white"),
  destructive: cn(preenchido, "bg-danger text-white"), // alias legado
  success: cn(preenchido, "bg-success text-success-foreground"),
};

// Pílula pede mais respiro lateral que retângulo — senão o texto encosta na curva.
const sizes: Record<Size, string> = {
  sm: "h-control-sm gap-1.5 px-3.5 text-[0.75rem]",
  md: "h-control gap-2 px-4 text-[0.8125rem]",
  lg: "h-control-lg gap-2 px-5 text-[0.8125rem]",
  icon: "h-control w-control px-0",
  "icon-sm": "h-control-sm w-control-sm px-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading, block, disabled, children, ...props },
    ref
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-pill font-medium",
        "transition-[background-color,border-color,color,transform,filter] duration-ds ease-ds",
        "disabled:pointer-events-none disabled:opacity-45",
        "[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        block && "w-full",
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
