"use client";

import { useAction } from "next-safe-action/hooks";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money/money";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { adjustBalanceAction } from "@/server/actions/planning";
import { type AccountSnapshot, allowsNegativeBalance } from "./account-meta";
import { MoneyField } from "./money-field";

type AdjustBalanceSheetProps = {
  account: AccountSnapshot;
  /** The button that opens the sheet (focus returns to it on close). */
  trigger: ReactNode;
};

/**
 * "Ajustar saldo" (doc 02 §6.7): asks for the real balance and records the
 * difference as an adjustment dated today, saying so before saving: "Vamos
 * registrar −R$ 12,40 como ajuste."
 */
export function AdjustBalanceSheet({
  account,
  trigger,
}: AdjustBalanceSheetProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [real, setReal] = useState<number | null>(account.balanceCents);
  const [error, setError] = useState<string>();
  const { executeAsync, isPending } = useAction(adjustBalanceAction);
  const difference = real === null ? null : real - account.balanceCents;

  function changeOpen(next: boolean) {
    if (next) {
      setReal(account.balanceCents);
      setError(undefined);
    }
    setOpen(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (real === null) {
      setError("Informe o saldo que aparece no banco.");
      return;
    }
    if (difference === 0) return;
    const result = await executeAsync({
      id: account.id,
      realBalanceCents: real,
    });
    if (result?.data) {
      toast("Saldo ajustado");
      setOpen(false);
      return;
    }
    const message =
      result?.serverError ??
      result?.validationErrors?.fieldErrors?.realBalanceCents?.[0] ??
      "Não deu para ajustar o saldo. Tente de novo.";
    setError(message);
    toast.error(message);
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        title="Ajustar saldo"
        description={`Informe quanto ${account.name} tem de verdade hoje.`}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(`${id}-real`)?.focus();
        }}
        footer={
          <Button
            type="submit"
            form={`${id}-form`}
            size="lg"
            className="w-full"
            loading={isPending}
            disabled={difference === null || difference === 0}
          >
            Ajustar saldo
          </Button>
        }
      >
        <form
          id={`${id}-form`}
          noValidate
          onSubmit={submit}
          className="flex flex-col gap-5"
        >
          <div className="flex items-center justify-between gap-3 rounded-control bg-surface-2 px-4 py-3">
            <span className="text-callout text-fg-2">Saldo no app</span>
            <Money
              cents={account.balanceCents}
              variant="headline"
              tone="neutral"
            />
          </div>
          <MoneyField
            id={`${id}-real`}
            label="Saldo real hoje"
            value={real}
            onValueChange={(cents) => {
              setReal(cents);
              setError(undefined);
            }}
            allowNegative={allowsNegativeBalance(account.type)}
            selectOnFocus
            error={error}
          />
          <AdjustmentPreview difference={difference} />
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Live explanation of what will be saved (and why the button is off). */
function AdjustmentPreview({ difference }: { difference: number | null }) {
  return (
    <div aria-live="polite" className="rounded-control bg-bg px-4 py-3">
      {difference === null ? (
        <p className="text-callout text-fg-2">
          Digite o saldo que aparece no banco ou na carteira.
        </p>
      ) : difference === 0 ? (
        <p className="text-callout text-fg-2">
          O saldo já confere. Não há nada a ajustar.
        </p>
      ) : (
        <>
          <p className="text-body text-fg">
            Vamos registrar{" "}
            <Money
              cents={difference}
              variant="callout"
              sign="always"
              className="text-body font-bold"
            />{" "}
            como ajuste.
          </p>
          <p className="mt-1 text-caption text-fg-3">
            Entra hoje no extrato como “Ajuste de saldo”, sem categoria, e não
            conta como receita nem despesa.
          </p>
        </>
      )}
    </div>
  );
}
