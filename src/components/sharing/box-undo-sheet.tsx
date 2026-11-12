"use client";

import { useAction } from "next-safe-action/hooks";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { SheetContent } from "@/components/ui/sheet";
import { undoEntryAction } from "@/server/actions/sharing";

/**
 * Confirms undoing one of the person's own entries in the history. The
 * domain refuses it when they took part of it out since (its message shows).
 */
export function BoxUndoSheet({
  entry,
  onDone,
}: {
  entry: { id: string; text: string };
  onDone: () => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | undefined>();
  const { executeAsync, isPending } = useAction(undoEntryAction);

  async function confirm() {
    const result = await executeAsync({ id: entry.id }).catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message) {
      setError(message);
      return;
    }
    toast("Lançamento desfeito.");
    onDone();
  }

  return (
    <SheetContent
      title="Desfazer este lançamento?"
      description={entry.text}
      footer={
        <>
          <FieldError id={`${id}-error`}>{error}</FieldError>
          <Button
            variant="destructive"
            size="lg"
            className="w-full"
            loading={isPending}
            onClick={() => void confirm()}
          >
            Desfazer lançamento
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={onDone}
          >
            Cancelar
          </Button>
        </>
      }
    >
      <p className="text-callout text-fg-2">
        O lançamento sai do histórico da caixinha. Se foi feito junto com um
        lançamento no seu extrato, ele também é desfeito.
      </p>
    </SheetContent>
  );
}
