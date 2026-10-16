"use client";

import { Trash2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { type FormEvent, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { formatMoneyShort } from "@/components/charts/format";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { SheetContent } from "@/components/ui/sheet";
import { toastWithUndo } from "@/components/ui/toast";
import {
  deleteBudgetAction,
  upsertBudgetAction,
} from "@/server/actions/planning";
import { MoneyField } from "../form/money-field";
import { ChoiceChips } from "../form/pickers";
import type { BudgetSuggestion } from "./model";

export type BudgetCategory = {
  id: string;
  name: string;
  icon: string;
  color: string;
};

export type EditableBudget = BudgetCategory & {
  budgetId: string;
  budgetCents: number;
  spentCents: number;
  scheduledCents: number;
};

const NETWORK_ERROR = "Não conseguimos salvar. Verifique a conexão.";

function averageHint(averageCents: number | undefined) {
  if (!averageCents) return "Sem gastos nesta categoria nos últimos 3 meses.";
  return `Média dos últimos 3 meses: ${formatMoneyShort(averageCents)}.`;
}

/** Edit an existing budget: amount, or remove it (with Desfazer). */
export function EditBudgetSheet({
  budget,
  month,
  monthName,
  averageCents,
  onDone,
}: {
  budget: EditableBudget;
  month: string;
  monthName: string;
  averageCents: number | undefined;
  onDone: () => void;
}) {
  const formId = useId();
  const [amount, setAmount] = useState<number | null>(budget.budgetCents);
  const [error, setError] = useState<string>();
  const save = useAction(upsertBudgetAction, {
    onSuccess: () => {
      toast(`Orçamento de ${budget.name} salvo.`);
      onDone();
    },
    onError: ({ error: failure }) => {
      setError(
        failure.validationErrors?.fieldErrors?.amountCents?.[0] ??
          failure.serverError ??
          NETWORK_ERROR,
      );
    },
  });
  const remove = useAction(deleteBudgetAction, {
    onSuccess: () => {
      onDone();
      toastWithUndo(`Orçamento de ${budget.name} removido.`, () => {
        void upsertBudgetAction({
          categoryId: budget.id,
          month,
          amountCents: budget.budgetCents,
        }).then((result) => {
          if (result?.serverError) toast(result.serverError);
        });
      });
    },
    onError: ({ error: failure }) => {
      toast(failure.serverError ?? NETWORK_ERROR);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (amount === null || amount <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    setError(undefined);
    save.execute({ categoryId: budget.id, month, amountCents: amount });
  }

  return (
    <SheetContent
      title={budget.name}
      description={`Orçamento de ${monthName}`}
      footer={
        <>
          <Button
            type="submit"
            form={formId}
            size="lg"
            className="w-full"
            loading={save.isPending}
          >
            Salvar orçamento
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="w-full text-danger hover:bg-danger-soft/60 active:bg-danger-soft"
            loading={remove.isPending}
            onClick={() => remove.execute({ id: budget.budgetId })}
          >
            <Trash2 aria-hidden="true" />
            Remover orçamento
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-5"
      >
        <div className="flex items-center gap-3 rounded-control bg-surface-2 p-3">
          <CategoryIcon icon={budget.icon} color={budget.color} />
          <dl className="grid flex-1 grid-cols-2 gap-x-3 text-caption">
            <div>
              <dt className="text-fg-3">Gasto em {monthName}</dt>
              <dd>
                <Money
                  cents={budget.spentCents}
                  variant="callout"
                  tone="neutral"
                  sign="never"
                />
              </dd>
            </div>
            <div>
              <dt className="text-fg-3">Agendado</dt>
              <dd>
                <Money
                  cents={budget.scheduledCents}
                  variant="callout"
                  tone="neutral"
                  sign="never"
                />
              </dd>
            </div>
          </dl>
        </div>
        <MoneyField
          id={`${formId}-amount`}
          label="Quanto quer gastar no mês"
          value={amount}
          onValueChange={(cents) => {
            setAmount(cents);
            setError(undefined);
          }}
          error={error}
          hint={averageHint(averageCents)}
        />
      </form>
    </SheetContent>
  );
}

/** Create a budget for an expense category that has none this month. */
export function NewBudgetSheet({
  categories,
  month,
  monthName,
  averages,
  onDone,
}: {
  categories: BudgetCategory[];
  month: string;
  monthName: string;
  averages: Readonly<Record<string, number>>;
  onDone: () => void;
}) {
  const formId = useId();
  const labelId = useId();
  const [categoryId, setCategoryId] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [amount, setAmount] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ category?: string; amount?: string }>(
    {},
  );
  const selected = categories.find((category) => category.id === categoryId);
  const save = useAction(upsertBudgetAction, {
    onSuccess: () => {
      toast(`Orçamento de ${selected?.name ?? "categoria"} criado.`);
      onDone();
    },
    onError: ({ error: failure }) => {
      const fields = failure.validationErrors?.fieldErrors;
      setErrors({
        category: fields?.categoryId?.[0],
        amount:
          fields?.amountCents?.[0] ??
          (fields?.categoryId
            ? undefined
            : (failure.serverError ?? NETWORK_ERROR)),
      });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!categoryId) next.category = "Escolha uma categoria.";
    if (amount === null || amount <= 0)
      next.amount = "Informe um valor maior que zero.";
    setErrors(next);
    if (next.category || next.amount || !categoryId || amount === null) return;
    save.execute({ categoryId, month, amountCents: amount });
  }

  return (
    <SheetContent
      title="Novo orçamento"
      description={`Para ${monthName}`}
      footer={
        categories.length > 0 ? (
          <Button
            type="submit"
            form={formId}
            size="lg"
            className="w-full"
            loading={save.isPending}
          >
            Criar orçamento
          </Button>
        ) : undefined
      }
    >
      {categories.length === 0 ? (
        <p className="pb-4 text-body text-fg-2">
          Todas as categorias de despesa já têm orçamento em {monthName}. Toque
          numa delas na lista para mudar o valor.
        </p>
      ) : (
        <form
          id={formId}
          onSubmit={submit}
          noValidate
          className="flex flex-col gap-5"
        >
          <div className="flex flex-col gap-2">
            <span id={labelId} className="text-callout font-semibold text-fg">
              Categoria
            </span>
            <ChoiceChips
              labelledBy={labelId}
              label="Categoria"
              value={categoryId}
              onChange={(id) => {
                setCategoryId(id);
                setErrors((current) => ({ ...current, category: undefined }));
              }}
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
                icon: (
                  <CategoryIcon
                    icon={category.icon}
                    color={category.color}
                    size="sm"
                    className="-ml-2 size-6"
                  />
                ),
              }))}
            />
            <FieldError id={`${formId}-category-error`}>
              {errors.category}
            </FieldError>
          </div>
          <MoneyField
            id={`${formId}-amount`}
            label="Quanto quer gastar no mês"
            value={amount}
            onValueChange={(cents) => {
              setAmount(cents);
              setErrors((current) => ({ ...current, amount: undefined }));
            }}
            error={errors.amount}
            hint={categoryId ? averageHint(averages[categoryId]) : undefined}
          />
        </form>
      )}
    </SheetContent>
  );
}

/** "Usar sugestão": the 3-month averages as budgets, one tap. */
export function SuggestionSheet({
  suggestions,
  month,
  monthName,
  onDone,
}: {
  suggestions: BudgetSuggestion[];
  month: string;
  monthName: string;
  onDone: () => void;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(suggestions.map((item) => item.categoryId)),
  );
  const [pending, startTransition] = useTransition();
  const picked = suggestions.filter((item) => chosen.has(item.categoryId));
  const total = picked.reduce((sum, item) => sum + item.amountCents, 0);

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function apply() {
    startTransition(async () => {
      let created = 0;
      let failure: string | undefined;
      for (const item of picked) {
        const result = await upsertBudgetAction({
          categoryId: item.categoryId,
          month,
          amountCents: item.amountCents,
        }).catch(() => undefined);
        if (result && !result.serverError && !result.validationErrors)
          created += 1;
        else failure = result?.serverError ?? NETWORK_ERROR;
      }
      if (failure) {
        toast(
          created > 0
            ? `${created} de ${picked.length} orçamentos criados. ${failure}`
            : failure,
        );
        if (created === 0) return;
      } else {
        toast(
          created === 1
            ? "1 orçamento criado."
            : `${created} orçamentos criados.`,
        );
      }
      onDone();
    });
  }

  return (
    <SheetContent
      title="Sugestão para o mês"
      description={`Média dos últimos 3 meses, arredondada para cima. Você ajusta depois.`}
      footer={
        <Button
          size="lg"
          className="w-full"
          loading={pending}
          disabled={picked.length === 0}
          onClick={apply}
        >
          {picked.length === 1
            ? `Criar 1 orçamento · ${formatMoneyShort(total)}`
            : `Criar ${picked.length} orçamentos · ${formatMoneyShort(total)}`}
        </Button>
      }
    >
      <fieldset className="pb-2">
        <legend className="sr-only">
          Orçamentos sugeridos para {monthName}
        </legend>
        <ul className="flex flex-col">
          {suggestions.map((item) => {
            const id = `sugestao-${item.categoryId}`;
            return (
              <li
                key={item.categoryId}
                className="border-b border-border last:border-b-0"
              >
                <label
                  htmlFor={id}
                  className="flex min-h-15 cursor-pointer items-center gap-3 py-2"
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={chosen.has(item.categoryId)}
                    onChange={() => toggle(item.categoryId)}
                    className="size-5 shrink-0 accent-(--primary)"
                  />
                  <CategoryIcon icon={item.icon} color={item.color} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-semibold text-fg">
                      {item.name}
                    </span>
                    <span className="text-caption text-fg-3">
                      média {formatMoneyShort(item.averageCents)}
                    </span>
                  </span>
                  <span className="text-headline text-fg tabular-nums">
                    {formatMoneyShort(item.amountCents)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
    </SheetContent>
  );
}
