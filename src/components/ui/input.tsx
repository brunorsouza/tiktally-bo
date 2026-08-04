import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Controles do DS.
 *
 * Diferenças que importam num console: altura menor (32px, não 40) porque a
 * tela é densa; fundo levemente afundado (`surface-1`) pra o campo parecer
 * "escavado" e não flutuar; e a borda ACENDE na marca ao focar, em vez do
 * anel externo que empurra o layout.
 */
const control =
  "h-control w-full rounded-md border border-line bg-surface-1 px-2.5 text-[0.8125rem] text-strong " +
  "transition-[border-color,background-color] duration-ds ease-ds " +
  "placeholder:text-subtle hover:border-line-strong " +
  "focus:border-brand focus:outline-none focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-45";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(control, className)} {...props} />
  )
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select ref={ref} className={cn(control, "cursor-pointer appearance-none pr-8", className)} {...props}>
        {children}
      </select>
      {/* Seta própria: a nativa varia entre navegadores e destoa do tema */}
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
    </div>
  )
);
Select.displayName = "Select";

/** Campo de busca com ícone — padrão repetido em 4 telas. */
export const SearchInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }
>(({ className, icon, ...props }, ref) => (
  <div className="relative flex-1">
    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle [&_svg]:h-3.5 [&_svg]:w-3.5">
      {icon}
    </span>
    <input ref={ref} className={cn(control, "pl-8", className)} {...props} />
  </div>
));
SearchInput.displayName = "SearchInput";
