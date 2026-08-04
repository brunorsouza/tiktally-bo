import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Linha de apoio sob o título — contexto sem virar parágrafo no corpo. */
  description?: ReactNode;
  /** Ações (botões). Ficam ancoradas na base, fora da área que rola. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Diálogo do DS.
 *
 * Diálogo é onde a pessoa DIGITA — por isso respira mais que o resto da
 * interface: cabeçalho com régua, corpo com padding maior, rodapé separado.
 * Densidade de tabela aqui vira claustrofobia.
 */
export function Dialog({ open, onClose, title, description, footer, children, className }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Trava o scroll do fundo — sem isso a página rola atrás do modal
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = anterior;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "flex max-h-[85vh] w-full max-w-[30rem] animate-scale-in flex-col overflow-hidden",
          "rounded-lg border border-line-strong bg-surface-2 shadow-3",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="t-title">{title}</h2>}
            {description && <p className="t-caption mt-1 leading-relaxed">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-subtle transition-colors duration-ds ease-ds hover:bg-surface-3 hover:text-strong"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {/* Irmão do corpo, não filho: fica ancorado mesmo com o conteúdo rolando */}
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-1 px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
