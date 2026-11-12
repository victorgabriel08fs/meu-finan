"use client";

import { ArrowRight, Check } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { Money } from "@/components/money/money";
import { MoneyField } from "@/components/planning/form/money-field";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetContent } from "@/components/ui/sheet";
import { toastWithUndo } from "@/components/ui/toast";
import { afterSheetsClose } from "@/components/ui/use-back-to-close";
import { formatBRL } from "@/lib/format/money";
import { settleUpAction, undoSettlementAction } from "@/server/actions/sharing";
import { useQuickAddStore } from "@/stores/quick-add";
import { quickAddPreset } from "./model";

/** A payment of the plan between the person and someone else. */
export type SettleTarget = {
  memberId: string;
  name: string;
  /** Seen from the person: positive, the other pays them. */
  expectedCents: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Marcar como acertado" (doc 02 §6.18): who paid whom, the amount (the
 * whole debt to start with; part of it is fine) and the date. Nothing goes
 * to the statement unless the person asks: "Lançar no meu extrato" opens a
 * Nova transação filled in. The toast offers "Desfazer".
 */
export function SettleSheet({
  groupId,
  groupName,
  target,
  todayIso,
  onDone,
}: {
  groupId: string;
  groupName: string;
  target: SettleTarget;
  todayIso: string;
  onDone: () => void;
}) {
  const id = useId();
  const [requestId] = useState(() => uuidv7());
  const debt = Math.abs(target.expectedCents);
  const theyPay = target.expectedCents > 0;
  const [amount, setAmount] = useState<number | null>(debt);
  const [date, setDate] = useState(todayIso);
  const [record, setRecord] = useState(false);
  const [errors, setErrors] = useState<{
    amount?: string;
    date?: string;
    form?: string;
  }>({});
  const { executeAsync, isPending } = useAction(settleUpAction);
  const openQuickAdd = useQuickAddStore((state) => state.openQuickAdd);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = {
      amount:
        amount === null || amount <= 0
          ? "O valor precisa ser maior que zero."
          : amount > debt
            ? `O acerto passa do que está em aberto (${formatBRL(debt)}).`
            : undefined,
      date: ISO_DATE.test(date) ? undefined : "Escolha a data.",
    };
    setErrors(found);
    if (found.amount || found.date || amount === null) return;
    const amountCents = amount;
    const result = await executeAsync({
      id: requestId,
      groupId,
      withMemberId: target.memberId,
      amountCents,
      expectedCents: target.expectedCents,
      occurredOn: date,
    }).catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message || !result?.data) {
      setErrors({ form: message ?? NETWORK_ERROR });
      return;
    }
    const { settlementId } = result.data;
    onDone();
    toastWithUndo(`Acerto de ${formatBRL(amountCents)} registrado.`, () => {
      void undoSettlementAction({ id: settlementId })
        .then((response) => {
          const failed = actionErrorMessage(response);
          if (failed) toast.error(failed);
        })
        .catch(() =>
          toast.error("Não deu para desfazer. Verifique a conexão."),
        );
    });
    if (record) {
      // After this sheet has closed and given its history entry back.
      requestAnimationFrame(() =>
        afterSheetsClose(() =>
          openQuickAdd(
            theyPay ? "income" : "expense",
            quickAddPreset({
              amountCents,
              description: `Acerto · ${groupName}`,
              date,
            }),
          ),
        ),
      );
    }
  }

  return (
    <SheetContent
      title="Marcar como acertado"
      description={
        theyPay
          ? `${target.name} pagou para você`
          : `Você pagou para ${target.name}`
      }
      footer={
        <>
          <FieldError id={`${id}-form-error`}>{errors.form}</FieldError>
          <Button
            type="submit"
            form={`${id}-form`}
            size="lg"
            className="w-full"
            loading={isPending}
          >
            {amount && amount > 0
              ? `Marcar ${formatBRL(amount)} como acertado`
              : "Marcar como acertado"}
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-6 pb-2"
      >
        <p className="flex flex-wrap items-center gap-2 text-body text-fg">
          <strong className="font-semibold">
            {theyPay ? target.name : "Você"}
          </strong>
          <ArrowRight aria-label="pagou para" className="size-5 text-fg-3" />
          <strong className="font-semibold">
            {theyPay ? "você" : target.name}
          </strong>
        </p>
        <MoneyField
          id={`${id}-amount`}
          label="Valor"
          value={amount}
          onValueChange={(cents) => {
            setAmount(cents);
            setErrors((current) => ({ ...current, amount: undefined }));
          }}
          error={errors.amount}
          hint={
            <>
              Em aberto:{" "}
              <Money
                cents={debt}
                variant="caption"
                tone="neutral"
                sign="never"
                className="font-semibold text-fg-2"
              />
              . Pode ser só uma parte.
            </>
          }
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-date`}>Data</Label>
          <Input
            id={`${id}-date`}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? `${id}-date-error` : undefined}
            className="tabular-nums"
          />
          <FieldError id={`${id}-date-error`}>{errors.date}</FieldError>
        </div>
        <label
          htmlFor={`${id}-record`}
          className="flex cursor-pointer items-start gap-3 rounded-control bg-surface-2 px-4 py-3"
        >
          <input
            id={`${id}-record`}
            type="checkbox"
            checked={record}
            onChange={(event) => setRecord(event.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-border-strong text-on-primary peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus [&_svg]:size-4"
          >
            {record ? <Check strokeWidth={3} /> : null}
          </span>
          <span className="flex flex-col">
            <span className="text-body font-semibold text-fg">
              Lançar no meu extrato
            </span>
            <span className="text-caption text-fg-3">
              {theyPay
                ? "Abre uma nova receita com o valor, para você escolher a conta."
                : "Abre uma nova despesa com o valor, para você escolher a conta."}
            </span>
          </span>
        </label>
      </form>
    </SheetContent>
  );
}

/**
 * "Acertar contas" with three or more people: who pays whom to settle
 * everything, and "Marcar como acertado" on the payments that involve the
 * person.
 */
export function PlanSheet({
  plan,
  meId,
  name,
  onSettle,
}: {
  plan: readonly { from: string; to: string; amountCents: number }[];
  meId: string;
  name: (memberId: string) => string;
  onSettle: (target: SettleTarget) => void;
}) {
  return (
    <SheetContent
      title="Acertar contas"
      description="Quem paga quem para zerar o grupo."
    >
      {plan.length === 0 ? (
        <p className="pb-2 text-body text-fg-2">Tudo acertado.</p>
      ) : (
        <ul className="flex flex-col gap-3 pb-2">
          {plan.map((transfer) => {
            const involvesMe = transfer.from === meId || transfer.to === meId;
            const other = transfer.from === meId ? transfer.to : transfer.from;
            return (
              <li
                key={`${transfer.from}-${transfer.to}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card bg-surface-2/60 px-4 py-3"
              >
                <span className="min-w-0 flex-[1_1_12rem] text-body text-fg">
                  <strong className="font-semibold">
                    {name(transfer.from)}
                  </strong>
                  {" paga para "}
                  <strong className="font-semibold">
                    {name(transfer.to).replace(/^Você$/, "você")}
                  </strong>{" "}
                  <Money
                    cents={transfer.amountCents}
                    variant="headline"
                    tone="neutral"
                    sign="never"
                  />
                </span>
                {involvesMe ? (
                  <Button
                    size="sm"
                    variant="tonal"
                    onClick={() =>
                      onSettle({
                        memberId: other,
                        name: name(other),
                        expectedCents:
                          transfer.to === meId
                            ? transfer.amountCents
                            : -transfer.amountCents,
                      })
                    }
                  >
                    Marcar como acertado
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SheetContent>
  );
}
