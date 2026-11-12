"use client";

import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { formatMoneyShort } from "@/components/charts/format";
import { DecimalField } from "@/components/planning/form/decimal-field";
import { MoneyField } from "@/components/planning/form/money-field";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SheetContent } from "@/components/ui/sheet";
import { allocate, PERCENT_TOTAL } from "@/lib/finance/split";
import {
  setMyPlanAction,
  setTargetWeightsAction,
} from "@/server/actions/sharing";
import { percentText } from "./box-model";
import { basisPointsFromPercent, percentFromBasisPoints } from "./model";

/** "Mudar meu plano": how much the person saves a month in the box. */
export function BoxPlanSheet({
  box,
  monthlyPlanCents,
  requiredMonthlyCents,
  onDone,
}: {
  box: { id: string; name: string };
  monthlyPlanCents: number;
  /** What their part needs a month to meet the deadline, when there is one. */
  requiredMonthlyCents: number | null;
  onDone: () => void;
}) {
  const id = useId();
  const [amount, setAmount] = useState<number | null>(
    monthlyPlanCents > 0 ? monthlyPlanCents : null,
  );
  const [error, setError] = useState<string | undefined>();
  const { executeAsync, isPending } = useAction(setMyPlanAction);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await executeAsync({
      boxId: box.id,
      monthlyCents: amount ?? 0,
    }).catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message) {
      setError(message);
      return;
    }
    toast(amount ? "Plano salvo." : "Plano tirado.");
    onDone();
  }

  return (
    <SheetContent
      title="Mudar meu plano"
      description={box.name}
      footer={
        <>
          <FieldError id={`${id}-error`}>{error}</FieldError>
          <Button
            type="submit"
            form={`${id}-form`}
            size="lg"
            className="w-full"
            loading={isPending}
          >
            Salvar plano
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
        <MoneyField
          id={`${id}-amount`}
          label="Quanto você guarda por mês"
          value={amount}
          onValueChange={(cents) => {
            setAmount(cents);
            setError(undefined);
          }}
          hint={
            requiredMonthlyCents && requiredMonthlyCents > 0
              ? `Para a sua parte chegar no prazo: ${formatMoneyShort(requiredMonthlyCents)}/mês.`
              : "Os outros veem o seu plano; é com ele que calculamos quando vocês chegam lá."
          }
        />
      </form>
    </SheetContent>
  );
}

export type PartMember = {
  memberId: string;
  name: string;
  isMe: boolean;
  /** Basis points saved for them, when the parts are by percentage. */
  weight: number;
};

/**
 * "Partes do objetivo" (the group's owner): equal by default, or a
 * percentage for each person that sums to 100%.
 */
export function BoxPartsSheet({
  box,
  method: savedMethod,
  members,
  onDone,
}: {
  box: { id: string; name: string };
  method: "equal" | "percent";
  members: PartMember[];
  onDone: () => void;
}) {
  const id = useId();
  const [method, setMethod] = useState(savedMethod);
  const equal = allocate(
    PERCENT_TOTAL,
    members.map(() => 1),
  );
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      members.map((member, index) => [
        member.memberId,
        savedMethod === "percent" ? member.weight : (equal[index] ?? 0),
      ]),
    ),
  );
  const [error, setError] = useState<string | undefined>();
  const { executeAsync, isPending } = useAction(setTargetWeightsAction);
  const sum = members.reduce(
    (total, member) => total + (weights[member.memberId] ?? 0),
    0,
  );
  const sumError =
    method === "percent" && sum !== PERCENT_TOTAL
      ? `Os percentuais somam ${percentText(sum)}%. Precisam somar 100%.`
      : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sumError) return;
    const result = await executeAsync({
      boxId: box.id,
      split:
        method === "equal"
          ? { method: "equal" }
          : {
              method: "percent",
              weights: members.map((member) => ({
                memberId: member.memberId,
                basisPoints: weights[member.memberId] ?? 0,
              })),
            },
    }).catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message) {
      setError(message);
      return;
    }
    toast("Partes salvas.");
    onDone();
  }

  return (
    <SheetContent
      title="Partes do objetivo"
      description={box.name}
      footer={
        <>
          <FieldError id={`${id}-error`}>{error}</FieldError>
          <Button
            type="submit"
            form={`${id}-form`}
            size="lg"
            className="w-full"
            loading={isPending}
          >
            Salvar partes
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
        <SegmentedControl
          ariaLabel="Como dividir o objetivo"
          className="min-h-12 [&>button]:min-h-11"
          options={[
            { value: "equal", label: "Iguais" },
            { value: "percent", label: "Percentual" },
          ]}
          value={method}
          onValueChange={(value) => {
            setMethod(value === "percent" ? "percent" : "equal");
            setError(undefined);
          }}
        />
        {method === "equal" ? (
          <p className="text-callout text-fg-2">
            Cada pessoa fica com a mesma parte do objetivo.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {members.map((member) => (
              <DecimalField
                key={member.memberId}
                id={`${id}-${member.memberId}`}
                label={member.isMe ? `${member.name} (você)` : member.name}
                value={percentFromBasisPoints(weights[member.memberId] ?? 0)}
                onValueChange={(percent) => {
                  setWeights((current) => ({
                    ...current,
                    [member.memberId]: Math.min(
                      PERCENT_TOTAL,
                      Math.max(0, basisPointsFromPercent(percent ?? 0)),
                    ),
                  }));
                  setError(undefined);
                }}
                suffix="%"
                min={0}
                max={100}
              />
            ))}
            <p
              aria-live="polite"
              className={
                sumError
                  ? "text-callout font-semibold text-danger"
                  : "text-callout text-fg-3"
              }
            >
              {sumError ?? "Os percentuais somam 100%."}
            </p>
          </div>
        )}
      </form>
    </SheetContent>
  );
}
