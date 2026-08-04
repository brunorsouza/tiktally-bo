import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Botão do DS.
 *
 * Hierarquia deliberada: numa tela de trabalho quase tudo é `ghost`/`outline`,
 * e `primary` marca A ação principal — uma por tela. Se duas coisas gritam,
 * nada grita.
 *
 * Estados são explícitos em vez de `opacity-90`: ao pressionar, o botão
 * "afunda" 1px. É esse retorno tátil que dá sensação de ferramenta.
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

const base =
  "bg-brand text-brand-foreground shadow-1 hover:bg-brand-strong active:bg-brand active:translate-y-px";

const variants: Record<Variant, string> = {
  primary: base,
  default: base, // alias legado
  outline: "border border-line-strong bg-transparent text-strong hover:bg-surface-3 active:translate-y-px",
  ghost: "bg-transparent text-subtle hover:bg-surface-3 hover:text-strong active:translate-y-px",
  subtle: "bg-surface-3 text-strong hover:bg-line active:translate-y-px",
  danger: "bg-danger text-white shadow-1 hover:brightness-110 active:translate-y-px",
  destructive: "bg-danger text-white shadow-1 hover:brightness-110 active:translate-y-px", // alias legado
  success: "bg-success text-success-foreground shadow-1 hover:brightness-110 active:translate-y-px",
};

const sizes: Record<Size, string> = {
  sm: "h-control-sm gap-1.5 px-2.5 text-[0.75rem]",
  md: "h-control gap-2 px-3 text-[0.8125rem]",
  lg: "h-control-lg gap-2 px-4 text-[0.8125rem]",
  icon: "h-control w-control",
  "icon-sm": "h-control-sm w-control-sm",
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
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-medium",
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
