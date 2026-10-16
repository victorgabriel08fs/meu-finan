"use client";

import { Info, Plus } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { actionErrorMessage } from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetContent } from "@/components/ui/sheet";
import { toastWithUndo } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  contributeToGoalAction,
  undoGoalContributionAction,
} from "@/server/actions/planning";
import { discardCreatedAction } from "@/server/actions/transactions";
import type { ContributionResult } from "@/server/domain/goals";
import { MoneyField } from "../form/money-field";
import { contributionMessage } from "./detail-model";

/** An account the money can leave from: not a card, not the goal's own. */
export type ContributionSource = {
  id: string;
  name: string;
  icon: string;
  color: string;
  balanceCents: number;
};

export type ContributionGoal = {
  id: string;
  name: string;
  /** Linked to an active account: the contribution is a transfer into it. */
  linked: boolean;
  accountName: string | null;
  targetCents: number;
  currentCents: number;
  monthlyPlanCents: number;
};

type Errors = Partial<Record<"amount" | "account" | "date" | "form", string>>;

const NETWORK_ERROR = "Não conseguimos salvar. Verifique a conexão.";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Aportar" (doc 02 §6.10): the amount (the planned monthly contribution to
 * start with) and, when the goal has a linked account, the account the money
 * leaves and the date — saved as a transfer, scheduled when dated ahead.
 * Without a linked account the amount adds to the value saved by hand. The
 * toast offers "Desfazer" (doc 02 §2.6).
 */
export function ContributeSheet({
  goal,
  sources,
  today,
  onDone,
}: {
  goal: ContributionGoal;
  /** Regular accounts other than the goal's; the first one is preselected. */
  sources: ContributionSource[];
  /** `YYYY-MM-DD`, the default date. */
  today: string;
  onDone: () => void;
}) {
  const id = useId();
  // One id per opening: sending the same contribution again creates nothing new.
  const [requestId] = useState(() => uuidv7());
  const [amount, setAmount] = useState<number | null>(
    goal.monthlyPlanCents > 0 ? goal.monthlyPlanCents : null,
  );
  const [fromId, setFromId] = useState(sources[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<Errors>({});
  const { executeAsync, isPending } = useAction(contributeToGoalAction);
  const { linked } = goal;
  const scheduled = linked && date > today;
  const remainingCents = Math.max(0, goal.targetCents - goal.currentCents);

  async function undo(result: ContributionResult, amountCents: number) {
    try {
      const response =
        result.kind === "transfer"
          ? await discardCreatedAction({ transferId: result.transferId })
          : await undoGoalContributionAction({ goalId: goal.id, amountCents });
      const message = actionErrorMessage(response);
      if (message) {
        toast.error(message);
        return;
      }
      toast("Aporte desfeito");
    } catch {
      toast.error("Não deu para desfazer. Verifique a conexão.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Errors = {};
    if (amount === null || amount <= 0) {
      found.amount = "O valor precisa ser maior que zero.";
    }
    if (linked && !fromId)
      found.account = "Escolha de qual conta sai o aporte.";
    if (linked && !ISO_DATE.test(date)) found.date = "Escolha a data.";
    setErrors(found);
    if (Object.values(found).some(Boolean) || amount === null) {
      // After the errors render: focus (and scroll to) the first invalid field.
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(
            `[data-contribute-form="${id}"] [aria-invalid="true"]`,
          )
          ?.focus();
      });
      return;
    }

    const amountCents = amount;
    const occurredOn = date;
    const result = await executeAsync({
      goalId: goal.id,
      amountCents,
      ...(linked ? { fromAccountId: fromId, occurredOn, requestId } : {}),
    }).catch(() => undefined);
    const data = result?.data;
    if (data) {
      onDone();
      toastWithUndo(
        contributionMessage({
          outcome: data,
          amountCents,
          goalName: goal.name,
          occurredOn,
        }),
        () => void undo(data, amountCents),
      );
      return;
    }
    const fieldErrors = result?.validationErrors?.fieldErrors;
    const fields = {
      amount: fieldErrors?.amountCents?.[0],
      account: fieldErrors?.fromAccountId?.[0],
      date: fieldErrors?.occurredOn?.[0],
    };
    setErrors({
      ...fields,
      // Under the button: the server's reason, or anything not shown by a field.
      form: !result
        ? NETWORK_ERROR
        : Object.values(fields).some(Boolean)
          ? undefined
          : (actionErrorMessage(result) ?? undefined),
    });
  }

  if (linked && sources.length === 0) {
    return (
      <SheetContent title="Aportar" description={goal.name}>
        <div className="flex flex-col items-start gap-4 pb-2">
          <p className="text-body text-fg-2">
            O aporte sai de outra conta e entra em {goal.accountName}. Cadastre
            a conta de onde sai o dinheiro para registrar o aporte.
          </p>
          {/* Leaving the page from a sheet: the link navigates and the sheet goes with the page. */}
          <Button asChild variant="tonal">
            <Link href="/contas/nova">
              <Plus aria-hidden="true" />
              Criar conta
            </Link>
          </Button>
        </div>
      </SheetContent>
    );
  }

  return (
    <SheetContent
      title="Aportar"
      description={
        linked ? `${goal.name} · entra em ${goal.accountName}` : goal.name
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
            {scheduled ? "Agendar aporte" : "Aportar"}
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        data-contribute-form={id}
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-6 pb-2"
      >
        <MoneyField
          id={`${id}-amount`}
          label="Valor do aporte"
          value={amount}
          onValueChange={(cents) => {
            setAmount(cents);
            setErrors((current) => ({ ...current, amount: undefined }));
          }}
          error={errors.amount}
          hint={
            remainingCents > 0 ? (
              <>
                Faltam{" "}
                <Money
                  cents={remainingCents}
                  variant="caption"
                  tone="neutral"
                  className="font-semibold text-fg-2"
                />{" "}
                para a meta.
              </>
            ) : (
              "Você já atingiu esta meta."
            )
          }
        />

        {linked ? (
          <>
            <fieldset className="min-w-0">
              <legend className="mb-2 text-callout font-semibold text-fg">
                De qual conta sai
              </legend>
              <div
                className={cn(
                  "overflow-hidden rounded-control border border-border-strong/40 [&>label+label]:border-t [&>label+label]:border-border",
                  errors.account && "border-danger",
                )}
              >
                {sources.map((source) => (
                  <label
                    key={source.id}
                    className="flex min-h-15 cursor-pointer items-center gap-3 px-3 py-2 transition-colors duration-100 has-checked:bg-primary-soft/60 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-focus"
                  >
                    <input
                      type="radio"
                      name={`${id}-from`}
                      value={source.id}
                      checked={fromId === source.id}
                      onChange={() => {
                        setFromId(source.id);
                        setErrors((current) => ({
                          ...current,
                          account: undefined,
                        }));
                      }}
                      aria-invalid={errors.account ? true : undefined}
                      aria-describedby={
                        errors.account ? `${id}-account-error` : undefined
                      }
                      className="sr-only"
                    />
                    <CategoryIcon
                      icon={source.icon}
                      color={source.color}
                      size="sm"
                      shape="square"
                      className="size-9 rounded-chip"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-semibold text-fg">
                        {source.name}
                      </span>
                      <Money
                        cents={source.balanceCents}
                        variant="caption"
                        tone="neutral"
                        className="text-fg-3"
                      />
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-5.5 shrink-0 items-center justify-center rounded-full border-2",
                        fromId === source.id
                          ? "border-primary"
                          : "border-border-strong",
                      )}
                    >
                      {fromId === source.id ? (
                        <span className="size-2.5 rounded-full bg-primary" />
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
              <FieldError id={`${id}-account-error`} className="mt-2">
                {errors.account}
              </FieldError>
            </fieldset>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-date`}>Data</Label>
              <Input
                id={`${id}-date`}
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setErrors((current) => ({ ...current, date: undefined }));
                }}
                aria-invalid={errors.date ? true : undefined}
                aria-describedby={[
                  `${id}-date-hint`,
                  errors.date ? `${id}-date-error` : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                className="tabular-nums"
              />
              <p id={`${id}-date-hint`} className="text-caption text-fg-3">
                {scheduled
                  ? "Com data futura, o aporte fica agendado até o dia."
                  : `O valor sai da conta escolhida e entra em ${goal.accountName}.`}
              </p>
              <FieldError id={`${id}-date-error`}>{errors.date}</FieldError>
            </div>
          </>
        ) : (
          <p className="flex items-start gap-3 rounded-control bg-surface-2 px-4 py-3 text-callout text-fg-2">
            <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            Sem conta vinculada, o aporte soma ao valor já guardado.
          </p>
        )}
      </form>
    </SheetContent>
  );
}
