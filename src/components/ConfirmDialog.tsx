import type { ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirmação para ações destrutivas (excluir/arquivar).
 *
 * O botão que confirma usa a variante `danger`: a cor é o aviso. Um "Excluir"
 * na cor da marca é a armadilha clássica de quem clica no automático.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirmar",
  loading,
  onConfirm,
  onClose,
}: {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      className="max-w-[26rem]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="t-body leading-relaxed">{description}</div>
    </Dialog>
  );
}
