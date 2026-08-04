import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Controles do DS.
 *
 * DENSIDADE POR CONTEXTO — a lição de um erro anterior: densidade de tabela
 * (32px, 10px de padding) aplicada a um formulário fica claustrofóbica, porque
 * ali a pessoa DIGITA e precisa de área de acerto e respiro.
 *
 *   - `md` (padrão, 36px + 12px): formulários e diálogos.
 *   - `sm` (32px + 10px): filtros de toolbar, onde o controle é secundário.
 *
 * O campo é "escavado" (fundo mais escuro que o painel) e a borda acende na
 * marca ao focar — sem anel externo, que empurra o layout.
 */
type Size = "sm" | "md";

const sizeCls: Record<Size, string> = {
  sm: "h-control px-2.5 text-[0.8125rem]",
  md: "h-control-lg px-3 text-[0.8125rem]",
};

const base =
  // Borda marcada (não a régua fininha): o campo precisa se ler como caixa
  // antes de a pessoa clicar nele.
  "w-full rounded-md border border-line-strong bg-surface-1 text-strong " +
  "transition-[border-color,background-color,box-shadow] duration-ds ease-ds " +
  "placeholder:text-subtle hover:border-subtle " +
  "focus:border-brand focus:bg-surface-2 focus:ring-1 focus:ring-brand/40 focus:outline-none focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line-strong";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { inputSize?: Size }
>(({ className, inputSize = "md", ...props }, ref) => (
  <input ref={ref} className={cn(base, sizeCls[inputSize], className)} {...props} />
));
Input.displayName = "Input";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { selectSize?: Size }
>(({ className, children, selectSize = "md", ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(base, sizeCls[selectSize], "cursor-pointer appearance-none pr-8", className)}
      {...props}
    >
      {children}
    </select>
    {/* Seta própria: a nativa varia entre navegadores e destoa do tema */}
    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
  </div>
));
Select.displayName = "Select";

/** Busca com ícone — padrão repetido em 4 telas. Nasce compacto (toolbar). */
export const SearchInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }
>(({ className, icon, ...props }, ref) => (
  <div className="relative flex-1">
    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle [&_svg]:h-3.5 [&_svg]:w-3.5">
      {icon}
    </span>
    <input ref={ref} className={cn(base, sizeCls.sm, "pl-8", className)} {...props} />
  </div>
));
SearchInput.displayName = "SearchInput";

/** Área de texto, mesma linguagem dos demais. */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-[5rem] px-3 py-2 text-[0.8125rem]", className)} {...props} />
));
Textarea.displayName = "Textarea";
