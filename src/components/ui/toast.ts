import { toast } from "sonner";

/**
 * Reversible action feedback (doc 02 §2.6, §5.15): "Lançamento excluído ·
 * Desfazer", shown for 5s because it carries an action.
 */
export function toastWithUndo(message: string, onUndo: () => void) {
  return toast(message, {
    duration: 5000,
    action: { label: "Desfazer", onClick: onUndo },
  });
}
