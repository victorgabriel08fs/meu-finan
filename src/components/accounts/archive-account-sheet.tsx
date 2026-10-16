"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money/money";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { archiveAccountAction } from "@/server/actions/planning";
import type { AccountSnapshot } from "./account-meta";

type ArchiveAccountSheetProps = {
  account: AccountSnapshot;
  trigger: ReactNode;
};

/**
 * "Arquivar" with a confirmation (doc 02 §4.4): the account leaves the lists
 * and the totals, its history stays. The verb is on the button.
 */
export function ArchiveAccountSheet({
  account,
  trigger,
}: ArchiveAccountSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { executeAsync, isPending } = useAction(archiveAccountAction);
  const isCard = account.type === "credit_card";
  const noun = isCard ? "cartão" : "conta";
  const owes = isCard && account.balanceCents < 0;

  async function archive() {
    const result = await executeAsync({ id: account.id });
    if (result && !result.serverError && !result.validationErrors) {
      toast(isCard ? "Cartão arquivado" : "Conta arquivada");
      // The sheet goes away with the page. Closing it first would step back
      // in history (useBackToClose) and race this navigation.
      setLeaving(true);
      router.push("/contas");
      return;
    }
    toast.error(
      result?.serverError ?? `Não deu para arquivar o ${noun}. Tente de novo.`,
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        title={`Arquivar ${account.name}?`}
        description={`O ${noun} sai das listas e dos totais. O histórico de lançamentos continua guardado.`}
        footer={
          <>
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              loading={isPending || leaving}
              onClick={archive}
            >
              Arquivar {noun}
            </Button>
            <SheetClose asChild>
              <Button variant="secondary" size="lg" className="w-full">
                Cancelar
              </Button>
            </SheetClose>
          </>
        }
      >
        {account.balanceCents !== 0 ? (
          <div className="flex items-start gap-3 rounded-control bg-warning-soft px-4 py-3 text-warning">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0"
            />
            <p className="text-callout">
              {owes ? "A dívida de " : "O saldo de "}
              <Money
                cents={Math.abs(account.balanceCents)}
                variant="callout"
                tone="neutral"
                sign="never"
                className="font-bold text-warning"
              />{" "}
              deixa de contar no total.{" "}
              {owes
                ? "Pague a fatura antes, se ainda usa o cartão."
                : "Se ainda usa a conta, prefira ajustar o saldo."}
            </p>
          </div>
        ) : (
          <p className="text-callout text-fg-2">
            O saldo está zerado, então nenhum total muda.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
