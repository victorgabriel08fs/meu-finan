"use client";

import { ChevronDown } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { formatCents } from "@/components/quick-add/calculator";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseBRLToCents } from "@/lib/finance";
import { updateTransactionAction } from "@/server/actions/transactions";
import { actionErrorMessage, NETWORK_ERROR } from "./action-result";
import {
  type EditScope,
  editScopeLock,
  type StatementItem,
} from "./statement-data";
import type { FilterCategory } from "./statement-filters";

type TransactionPatch = {
  description?: string;
  amountCents?: number;
  categoryId?: string | null;
  occurredOn?: string;
  notes?: string | null;
};

type TransactionEditFormProps = {
  item: StatementItem;
  categories: FilterCategory[];
  /** The sheet footer's submit button points here with `form={formId}`. */
  formId: string;
  onDone: () => void;
  onPendingChange: (pending: boolean) => void;
  /**
   * Asks where an edit of an installment or a recurring entry applies (the
   * sheet footer shows the choices); null when the user goes back.
   */
  chooseScope: () => Promise<EditScope | null>;
};

type Errors = { amount?: string; date?: string; form?: string };

const selectClass =
  "h-13 w-full appearance-none rounded-control border border-border-strong bg-surface pr-11 pl-4 text-input text-fg outline-none focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]";

/**
 * Edit of an entry from the detail sheet (doc 02 §6.6): description, amount,
 * category, date and note. Only changed fields are sent. Saving an
 * installment or a recurring entry asks for the scope (Só este · Este e os
 * próximos · Todos), unless the change can only apply to this one.
 */
export function TransactionEditForm({
  item,
  categories,
  formId,
  onDone,
  onPendingChange,
  chooseScope,
}: TransactionEditFormProps) {
  const ids = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState(item.description);
  const [amount, setAmount] = useState(formatCents(Math.abs(item.amountCents)));
  const [categoryId, setCategoryId] = useState(item.categoryId ?? "");
  const [date, setDate] = useState(item.occurredOn);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [errors, setErrors] = useState<Errors>({});

  const editsAmount = item.kind !== "adjustment";
  const editsCategory = item.kind === "income" || item.kind === "expense";
  const options = categories.filter((category) => category.kind === item.kind);
  const partOfSeries = item.installment !== null || item.recurring;
  const dateChanged = date !== item.occurredOn;
  const amountChanged =
    editsAmount && parseBRLToCents(amount) !== Math.abs(item.amountCents);
  const scopeLock = editScopeLock(item, {
    date: dateChanged,
    amount: amountChanged,
  });
  // The date hint wins when both changed: it is the one that applies.
  const amountHint = !dateChanged && amountChanged ? scopeLock : null;

  function amountError(cents: number | null): string | undefined {
    if (cents === null) return "Digite um valor válido, como 64,50";
    if (cents <= 0) return "O valor precisa ser maior que zero";
    return undefined;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cents = editsAmount ? parseBRLToCents(amount) : null;
    const nextErrors: Errors = {
      amount: editsAmount ? amountError(cents) : undefined,
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? undefined : "Escolha uma data",
    };
    if (nextErrors.amount || nextErrors.date) {
      setErrors(nextErrors);
      (nextErrors.amount ? amountRef : dateRef).current?.focus();
      return;
    }

    const patch: TransactionPatch = {};
    if (description.trim() && description.trim() !== item.description) {
      patch.description = description.trim();
    }
    if (editsAmount && cents !== null && cents !== Math.abs(item.amountCents)) {
      patch.amountCents = cents;
    }
    if (editsCategory && (categoryId || null) !== item.categoryId) {
      patch.categoryId = categoryId || null;
    }
    if (date !== item.occurredOn) patch.occurredOn = date;
    if ((notes.trim() || null) !== (item.notes ?? null)) {
      patch.notes = notes.trim() || null;
    }
    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }

    let scope: EditScope = "this";
    if (partOfSeries && !scopeLock) {
      const chosen = await chooseScope();
      if (chosen === null) return;
      scope = chosen;
    }

    setErrors({});
    onPendingChange(true);
    try {
      const result = await updateTransactionAction({
        id: item.id,
        patch,
        scope,
      });
      const message = actionErrorMessage(result);
      if (message) {
        setErrors({ form: message });
        return;
      }
      toast(
        scope === "this"
          ? "Lançamento atualizado"
          : item.installment
            ? "Parcelas atualizadas"
            : "Lançamentos atualizados",
      );
      onDone();
    } catch {
      setErrors({ form: NETWORK_ERROR });
    } finally {
      onPendingChange(false);
    }
  }

  return (
    <form
      id={formId}
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-4 pb-2"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-description`}>Descrição</Label>
        <Input
          id={`${ids}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={120}
          autoComplete="off"
          enterKeyHint="next"
        />
      </div>

      {editsAmount ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-amount`}>Valor</Label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-input font-semibold text-fg-2"
            >
              R$
            </span>
            <Input
              ref={amountRef}
              id={`${ids}-amount`}
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="next"
              value={amount}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={
                errors.amount
                  ? `${ids}-amount-error`
                  : amountHint
                    ? `${ids}-amount-hint`
                    : undefined
              }
              onChange={(event) => setAmount(event.target.value)}
              onBlur={() => {
                const cents = parseBRLToCents(amount);
                if (cents !== null && cents > 0) setAmount(formatCents(cents));
                setErrors((current) => ({
                  ...current,
                  amount: amountError(cents),
                }));
              }}
              className="pl-12 tabular-nums"
            />
          </div>
          <FieldError id={`${ids}-amount-error`}>{errors.amount}</FieldError>
          {!errors.amount && amountHint ? (
            <p id={`${ids}-amount-hint`} className="text-caption text-fg-2">
              {amountHint}
            </p>
          ) : null}
        </div>
      ) : null}

      {editsCategory ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-category`}>Categoria</Label>
          <div className="relative">
            <select
              id={`${ids}-category`}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={selectClass}
            >
              <option value="">Sem categoria</option>
              {options.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-fg-3"
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-date`}>Data</Label>
        <Input
          ref={dateRef}
          id={`${ids}-date`}
          type="date"
          required
          value={date}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={
            errors.date
              ? `${ids}-date-error`
              : partOfSeries && dateChanged
                ? `${ids}-date-hint`
                : undefined
          }
          onChange={(event) => setDate(event.target.value)}
        />
        <FieldError id={`${ids}-date-error`}>{errors.date}</FieldError>
        {!errors.date && partOfSeries && dateChanged && scopeLock ? (
          <p id={`${ids}-date-hint`} className="text-caption text-fg-2">
            {scopeLock}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-notes`}>Nota</Label>
        <textarea
          id={`${ids}-notes`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={500}
          rows={3}
          className="min-h-24 w-full resize-y rounded-control border border-border-strong bg-surface px-4 py-3 text-input text-fg outline-none placeholder:text-fg-3 focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]"
          placeholder="Opcional"
        />
      </div>

      {errors.form ? (
        <FieldError id={`${ids}-form-error`}>{errors.form}</FieldError>
      ) : null}
    </form>
  );
}
