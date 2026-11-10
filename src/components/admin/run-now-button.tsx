"use client";

import { LoaderCircle, Play } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { runDailyJobAction } from "@/server/actions/admin";

const RESULT_MESSAGES = {
  ok: "Rotina concluída.",
  partial: "Rotina concluída com problemas.",
  failed: "A rotina falhou.",
} as const;

/**
 * "Rodar agora" (doc 02 §6.17): asks first (it can take minutes), then runs
 * the whole job on the server and tells how it ended. A refusal from the
 * server (running, too soon) comes as it is, in a toast.
 */
export function RunNowButton({
  onFinished,
}: {
  /** The id of the run that just ended, to open it in the list. */
  onFinished: (runId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { executeAsync, isPending } = useAction(runDailyJobAction);

  async function run() {
    setOpen(false);
    try {
      const result = await executeAsync();
      const error = actionErrorMessage(result);
      if (error || !result?.data) {
        toast.error(error ?? "Algo deu errado. Tente novamente.");
        return;
      }
      const { status, runId } = result.data;
      if (status === "ok") toast.success(RESULT_MESSAGES.ok);
      else if (status === "partial") toast.warning(RESULT_MESSAGES.partial);
      else toast.error(RESULT_MESSAGES.failed);
      onFinished(runId);
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      // The button was disabled while it ran, so the focus was lost.
      requestAnimationFrame(() => trigger.current?.focus());
    }
  }

  return (
    <section aria-label="Rodar agora" className="flex flex-col gap-2">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            ref={trigger}
            size="lg"
            className="w-full sm:w-auto sm:self-start"
            disabled={isPending}
            aria-busy={isPending || undefined}
          >
            {isPending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Play aria-hidden="true" />
            )}
            {isPending ? "Rodando…" : "Rodar agora"}
          </Button>
        </SheetTrigger>
        <SheetContent
          title="Rodar a rotina agora?"
          description="Pode levar até 4 minutos. Mantenha esta tela aberta."
          footer={
            <>
              <Button size="lg" className="w-full" onClick={run}>
                Rodar
              </Button>
              <SheetClose asChild>
                <Button variant="secondary" size="lg" className="w-full">
                  Cancelar
                </Button>
              </SheetClose>
            </>
          }
        >
          <p className="text-callout text-fg-2">
            Roda a rotina inteira agora, como se fosse o horário do cron.
          </p>
        </SheetContent>
      </Sheet>
      {isPending ? (
        <output className="block text-callout text-fg-2">
          Rodando a rotina. Pode levar alguns minutos.
        </output>
      ) : (
        <p className="text-caption text-fg-3">
          Roda a rotina inteira agora. É seguro repetir: os avisos que já saíram
          hoje não são enviados de novo.
        </p>
      )}
    </section>
  );
}
