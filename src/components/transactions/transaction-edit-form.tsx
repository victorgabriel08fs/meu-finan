"use client";

import { ChevronDown } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { formatCents } from "@/components/quick-add/calculator";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseBRLToCents } from "@/lib/finance";
import { shortDateLabel } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import { updateTransactionAction } from "@/server/actions/transactions";
import { actionErrorMessage, NETWORK_ERROR } from "./action-result";
import type { StatementItem } from "./statement-data";
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
};

type Errors = { amount?: string; date?: string; form?: string };

type Scope = "this" | "future" | "all";

type ScopeOption = { value: Scope; label: string; hint?: string };

/** Where an edit of an installment or a recurring entry applies. */
function scopeOptions(item: StatementItem): ScopeOption[] {
  const installment = item.installment;
  if (installment) {
    const options: ScopeOption[] = [
      { value: "this", label: "Só esta parcela" },
    ];
    if (installment.number > 1 && installment.number < installment.count) {
      options.push({
        value: "future",
        label: "Esta e as próximas",
        hint: `Parcelas ${installment.number} a ${installment.count}`,
      });
    }
    options.push({
      value: "all",
      label: "Todas as parcelas",
      hint: `As ${installment.count} parcelas da compra`,
    });
    return options;
  }
  return [
    { value: "this", label: "Só este" },
    {
      value: "future",
      label: "Este e os próximos",
      hint: `A repetição muda a partir de ${shortDateLabel(item.occurredOn)}`,
    },
    { value: "all", label: "Todos", hint: "Os já pagos ficam como estão" },
  ];
}

const selectClass =
  "h-13 w-full appearance-none rounded-control border border-border-strong bg-surface pr-11 pl-4 text-input text-fg outline-none focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]";

/**
 * Edit of an entry from the detail sheet (doc 02 §6.6): description, amount,
 * category, date and note. Only changed fields are sent. Installments and
 * recurrences pick the scope (Só este · Este e os próximos · Todos); a new
 * date, or a new amount for installments, applies to this one only.
 */
export function TransactionEditForm({
  item,
  categories,
  formId,
  onDone,
  onPendingChange,
}: TransactionEditFormProps) {
  const ids = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState(item.description);
  const [amount, setAmount] = useState(formatCents(Math.abs(item.amountCents)));
  const [categoryId, setCategoryId] = useState(item.categoryId ?? "");
  const [date, setDate] = useState(item.occurredOn);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [scope, setScope] = useState<Scope>("this");
  const [errors, setErrors] = useState<Errors>({});

  const editsAmount = item.kind !== "adjustment";
  const editsCategory = item.kind === "income" || item.kind === "expense";
  const options = categories.filter((category) => category.kind === item.kind);
  const partOfSeries = item.installment !== null || item.recurring;
  const amountChanged =
    editsAmount && parseBRLToCents(amount) !== Math.abs(item.amountCents);
  const scopeLock =
    date !== item.occurredOn
      ? "Para mudar a data, altere só este lançamento."
      : item.installment && amountChanged
        ? "Para mudar o valor de várias parcelas, exclua a compra e lance de novo."
        : null;
  const appliedScope: Scope = scopeLock ? "this" : scope;

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

    setErrors({});
    onPendingChange(true);
    try {
      const result = await updateTransactionAction({
        id: item.id,
        patch,
        scope: appliedScope,
      });
      const message = actionErrorMessage(result);
      if (message) {
        setErrors({ form: message });
        return;
      }
      toast(
        appliedScope === "this"
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
                errors.amount ? `${ids}-amount-error` : undefined
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
          aria-describedby={errors.date ? `${ids}-date-error` : undefined}
          onChange={(event) => setDate(event.target.value)}
        />
        <FieldError id={`${ids}-date-error`}>{errors.date}</FieldError>
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

      {partOfSeries ? (
        <fieldset
          className="min-w-0"
          aria-describedby={scopeLock ? `${ids}-scope-lock` : undefined}
        >
          <legend className="mb-2 text-callout font-semibold text-fg">
            {item.installment ? "Alterar quais parcelas" : "Alterar quais"}
          </legend>
          <div className="overflow-hidden rounded-control border border-border-strong/40 [&>label+label]:border-t [&>label+label]:border-border">
            {scopeOptions(item).map((option) => {
              const checked = appliedScope === option.value;
              const disabled = scopeLock !== null && option.value !== "this";
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex min-h-13 items-center gap-3 px-3.5 py-2.5 transition-colors duration-100 has-checked:bg-primary-soft/60 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-focus",
                    disabled
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer",
                  )}
                >
                  <input
                    type="radio"
                    name={`${ids}-scope`}
                    value={option.value}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => setScope(option.value)}
                    className="sr-only"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body font-semibold text-fg">
                      {option.label}
                    </span>
                    {option.hint ? (
                      <span className="text-caption text-fg-3">
                        {option.hint}
                      </span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-5.5 shrink-0 items-center justify-center rounded-full border-2",
                      checked ? "border-primary" : "border-border-strong",
                    )}
                  >
                    {checked ? (
                      <span className="size-2.5 rounded-full bg-primary" />
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
          {scopeLock ? (
            <p id={`${ids}-scope-lock`} className="mt-2 text-caption text-fg-2">
              {scopeLock}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {errors.form ? (
        <FieldError id={`${ids}-form-error`}>{errors.form}</FieldError>
      ) : null}
    </form>
  );
}
