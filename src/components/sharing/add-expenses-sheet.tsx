"use client";

import { Check, Receipt } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { EmptyState } from "@/components/app/empty-state";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { MoneyField } from "@/components/planning/form/money-field";
import { NativeSelect } from "@/components/planning/form/native-select";
import { ChoiceChip } from "@/components/quick-add/choice-chip";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SheetContent } from "@/components/ui/sheet";
import {
  SHEET_SEARCH_THRESHOLD,
  SheetSearch,
} from "@/components/ui/sheet-search";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import type { SplitMethod } from "@/lib/finance/split";
import { shortDateLabel } from "@/lib/format/date";
import { matchesSearch } from "@/lib/format/search";
import { SPLIT_METHOD_LABELS } from "@/lib/sharing/labels";
import {
  EXPENSE_DESCRIPTION_MAX,
  MAX_EXPENSES_PER_ADD,
} from "@/lib/sharing/limits";
import { cn } from "@/lib/utils";
import {
  addSharedExpensesAction,
  listShareableExpensesAction,
} from "@/server/actions/sharing";
import type { ShareDefaultSplit } from "@/server/db/schema/types";
import type { ShareableExpense } from "@/server/domain/sharing/expenses";
import { useQuickAddStore } from "@/stores/quick-add";
import {
  draftInputs,
  initialDraft,
  previewSplit,
  quickAddPreset,
  type SplitDraft,
  type SplitMember,
} from "./model";
import { SplitEditor } from "./split-editor";

export type CategoryOption = {
  id: string;
  name: string;
  parentId: string | null;
};

type Period = "current" | "previous" | "custom";

const LOT_METHODS: readonly SplitMethod[] = ["equal", "percent", "shares"];

/**
 * "Adicionar despesas" (doc 02 §6.18): "Do meu extrato" lists the person's
 * own expenses of a period (and a category) not in a group yet, to tick and
 * add in one go with the group's split; "Nova" types one, with who paid and
 * how it is divided.
 */
export function AddExpensesSheet({
  groupId,
  groupName,
  members,
  meId,
  defaultSplit,
  periods,
  categories,
  todayIso,
  onDone,
}: {
  groupId: string;
  groupName: string;
  members: readonly SplitMember[];
  meId: string;
  defaultSplit: ShareDefaultSplit | null;
  periods: Record<"current" | "previous", { start: string; end: string }>;
  categories: readonly CategoryOption[];
  todayIso: string;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<"statement" | "new">("statement");
  return tab === "statement" ? (
    <StatementTab
      groupId={groupId}
      members={members}
      defaultSplit={defaultSplit}
      periods={periods}
      categories={categories}
      onDone={onDone}
      tabs={<Tabs value={tab} onChange={setTab} />}
    />
  ) : (
    <NewTab
      groupId={groupId}
      groupName={groupName}
      members={members}
      meId={meId}
      defaultSplit={defaultSplit}
      todayIso={todayIso}
      onDone={onDone}
      tabs={<Tabs value={tab} onChange={setTab} />}
    />
  );
}

function Tabs({
  value,
  onChange,
}: {
  value: "statement" | "new";
  onChange: (value: "statement" | "new") => void;
}) {
  return (
    <SegmentedControl
      ariaLabel="De onde vem a despesa"
      options={[
        { value: "statement", label: "Do meu extrato" },
        { value: "new", label: "Nova" },
      ]}
      value={value}
      onValueChange={(next) => onChange(next as "statement" | "new")}
      className="mb-5 min-h-12 [&>button]:min-h-11"
    />
  );
}

function categoryLabel(
  category: CategoryOption,
  all: readonly CategoryOption[],
): string {
  const parent = category.parentId
    ? all.find((item) => item.id === category.parentId)
    : null;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

function StatementTab({
  groupId,
  members,
  defaultSplit,
  periods,
  categories,
  onDone,
  tabs,
}: {
  groupId: string;
  members: readonly SplitMember[];
  defaultSplit: ShareDefaultSplit | null;
  periods: Record<"current" | "previous", { start: string; end: string }>;
  categories: readonly CategoryOption[];
  onDone: () => void;
  tabs: ReactNode;
}) {
  const id = useId();
  const [period, setPeriod] = useState<Period>("current");
  const [custom, setCustom] = useState(periods.current);
  const [categoryId, setCategoryId] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [items, setItems] = useState<ShareableExpense[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<SplitDraft>(() =>
    initialDraft(members, defaultSplit, null),
  );
  const [editingSplit, setEditingSplit] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [ids] = useState(() => new Map<string, string>());
  const add = useAction(addSharedExpensesAction);

  const range = period === "custom" ? custom : periods[period];
  const sorted = useMemo(
    () =>
      [...categories].sort((a, b) =>
        categoryLabel(a, categories).localeCompare(
          categoryLabel(b, categories),
          "pt-BR",
        ),
      ),
    [categories],
  );
  // Past 8 options the list gets a search (doc 02 §4.4); the chosen one stays.
  const searchable = sorted.length > SHEET_SEARCH_THRESHOLD;
  const visibleCategories = searchable
    ? sorted.filter(
        (category) =>
          category.id === categoryId ||
          matchesSearch(categoryLabel(category, categories), categoryQuery),
      )
    : sorted;

  // `attempt`: "Tentar de novo" loads the same filter again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger
  useEffect(() => {
    let cancelled = false;
    if (!range.start || !range.end || range.start > range.end) return;
    setItems(null);
    setLoadError(false);
    listShareableExpensesAction({
      groupId,
      start: range.start,
      end: range.end,
      categoryId: categoryId || null,
    })
      .then((result) => {
        if (cancelled) return;
        if (!result?.data) {
          setLoadError(true);
          return;
        }
        setItems(result.data.items);
        setSelected(new Set());
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, range.start, range.end, categoryId, attempt]);

  const preview = previewSplit(10_000, draft, members);
  const count = selected.size;

  async function submit() {
    if (count === 0 || !preview?.ok) return;
    const chosen = (items ?? []).filter((item) => selected.has(item.id));
    const inputs = draftInputs(draft, members).filter(
      (input) => input.value > 0,
    );
    const result = await add
      .executeAsync({
        groupId,
        items: chosen.map((item) => {
          // One id per entry, kept across retries: sending again adds nothing.
          const key = ids.get(item.id) ?? uuidv7();
          ids.set(item.id, key);
          return {
            id: key,
            description: item.description.slice(0, EXPENSE_DESCRIPTION_MAX),
            amountCents: item.amountCents,
            occurredOn: item.occurredOn,
            paidByMemberId: members.find((member) => member.isMe)?.id ?? "",
            transactionId: item.id,
            method: draft.method,
            inputs,
          };
        }),
      })
      .catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message || !result?.data) {
      setError(message ?? NETWORK_ERROR);
      return;
    }
    onDone();
    const added = result.data.added;
    toast(
      added === 1 ? "1 despesa adicionada." : `${added} despesas adicionadas.`,
    );
  }

  const allSelected =
    items !== null && items.length > 0 && count === items.length;
  const splitSummary = `${SPLIT_METHOD_LABELS[draft.method]} entre ${members
    .filter((member) => (draft.inputs[member.id] ?? 0) > 0)
    .map((member) => (member.isMe ? "você" : member.name))
    .join(", ")}`;

  return (
    <SheetContent
      title="Adicionar despesas"
      footer={
        <>
          <FieldError id={`${id}-error`}>{error}</FieldError>
          <Button
            size="lg"
            className="w-full"
            disabled={
              count === 0 || !preview?.ok || count > MAX_EXPENSES_PER_ADD
            }
            loading={add.isPending}
            onClick={() => void submit()}
          >
            {count === 0
              ? "Escolha as despesas"
              : count === 1
                ? "Adicionar 1 despesa"
                : `Adicionar ${count} despesas`}
          </Button>
        </>
      }
    >
      {tabs}
      <div className="flex flex-col gap-5 pb-2">
        <fieldset className="flex min-w-0 flex-wrap gap-2">
          <legend className="sr-only">Período</legend>
          {(
            [
              ["current", "Este mês"],
              ["previous", "Mês passado"],
              ["custom", "Escolher"],
            ] as const
          ).map(([value, label]) => (
            <ChoiceChip
              key={value}
              selected={period === value}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {label}
            </ChoiceChip>
          ))}
        </fieldset>
        {period === "custom" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-start`}>De</Label>
              <Input
                id={`${id}-start`}
                type="date"
                value={custom.start}
                onChange={(event) =>
                  setCustom((value) => ({
                    ...value,
                    start: event.target.value,
                  }))
                }
                className="tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-end`}>Até</Label>
              <Input
                id={`${id}-end`}
                type="date"
                value={custom.end}
                onChange={(event) =>
                  setCustom((value) => ({ ...value, end: event.target.value }))
                }
                className="tabular-nums"
              />
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-category`}>Categoria</Label>
          {searchable ? (
            <SheetSearch
              label="Buscar categoria"
              value={categoryQuery}
              onChange={setCategoryQuery}
            />
          ) : null}
          <NativeSelect
            id={`${id}-category`}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Todas as categorias</option>
            {visibleCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryLabel(category, categories)}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-2 rounded-control bg-surface-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-callout text-fg-2">
              <span className="font-semibold text-fg">Divisão:</span>{" "}
              {splitSummary}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditingSplit((value) => !value)}
            >
              {editingSplit ? "Pronto" : "Mudar"}
            </Button>
          </div>
          {editingSplit ? (
            <SplitEditor
              members={members}
              totalCents={null}
              draft={draft}
              onDraftChange={setDraft}
              methods={LOT_METHODS}
            />
          ) : null}
        </div>

        {loadError ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 py-6 text-center"
          >
            <p className="text-body text-fg-2">
              Não deu para carregar as suas despesas.
            </p>
            <Button
              variant="tonal"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Tentar de novo
            </Button>
          </div>
        ) : items === null ? (
          <LoadingRegion
            label="Carregando despesas…"
            className="flex flex-col gap-2"
          >
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-15 w-full" />
            ))}
          </LoadingRegion>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            title="Nenhuma despesa para dividir"
            description="Neste período não há despesas suas fora de um grupo."
            className="py-6"
          />
        ) : (
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="sr-only">Despesas do seu extrato</legend>
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={() =>
                setSelected(
                  allSelected
                    ? new Set()
                    : new Set(items.map((item) => item.id)),
                )
              }
            >
              {allSelected
                ? "Desmarcar todas"
                : `Selecionar todas (${items.length})`}
            </Button>
            <ul className="overflow-hidden rounded-control border border-border-strong/40 [&>li+li]:border-t [&>li+li]:border-border">
              {items.map((item) => {
                const checked = selected.has(item.id);
                return (
                  <li key={item.id}>
                    <label className="flex min-h-15 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 has-checked:bg-primary-soft/60 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-focus">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          })
                        }
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md border-2 text-on-primary [&_svg]:size-4",
                          checked
                            ? "border-primary bg-primary"
                            : "border-border-strong",
                        )}
                      >
                        {checked ? <Check strokeWidth={3} /> : null}
                      </span>
                      <CategoryIcon
                        icon={item.categoryIcon ?? "ellipsis"}
                        color={item.categoryColor ?? "neutral"}
                        size="sm"
                      />
                      <span className="flex min-w-0 flex-[1_1_8rem] flex-col">
                        <span className="truncate text-body font-semibold text-fg">
                          {item.description}
                        </span>
                        <span className="truncate text-caption text-fg-3">
                          {shortDateLabel(item.occurredOn)} ·{" "}
                          {item.categoryName ?? "Sem categoria"}
                        </span>
                      </span>
                      <Money
                        cents={item.amountCents}
                        variant="callout"
                        tone="neutral"
                        sign="never"
                        className="ml-auto"
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}
      </div>
    </SheetContent>
  );
}

function NewTab({
  groupId,
  groupName,
  members,
  meId,
  defaultSplit,
  todayIso,
  onDone,
  tabs,
}: {
  groupId: string;
  groupName: string;
  members: readonly SplitMember[];
  meId: string;
  defaultSplit: ShareDefaultSplit | null;
  todayIso: string;
  onDone: () => void;
  tabs: ReactNode;
}) {
  const id = useId();
  const [requestId] = useState(() => uuidv7());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(todayIso);
  const [paidBy, setPaidBy] = useState(meId);
  const [draft, setDraft] = useState<SplitDraft>(() =>
    initialDraft(members, defaultSplit, null),
  );
  const [errors, setErrors] = useState<{
    description?: string;
    amount?: string;
    form?: string;
  }>({});
  const add = useAction(addSharedExpensesAction);
  const openQuickAdd = useQuickAddStore((state) => state.openQuickAdd);
  const preview = previewSplit(amount, draft, members);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = {
      description: description.trim() ? undefined : "Informe uma descrição.",
      amount:
        amount && amount > 0
          ? undefined
          : "O valor precisa ser maior que zero.",
    };
    setErrors(found);
    if (found.description || found.amount || amount === null || !preview?.ok)
      return;
    const result = await add
      .executeAsync({
        groupId,
        items: [
          {
            id: requestId,
            description: description.trim(),
            amountCents: amount,
            occurredOn: date,
            paidByMemberId: paidBy,
            method: draft.method,
            inputs: draftInputs(draft, members).filter(
              (input) => input.value > 0,
            ),
          },
        ],
      })
      .catch(() => undefined);
    const message = result ? actionErrorMessage(result) : NETWORK_ERROR;
    if (message) {
      setErrors({ form: message });
      return;
    }
    onDone();
    const amountCents = amount;
    const text = description.trim();
    if (paidBy === meId) {
      toast("Despesa adicionada.", {
        duration: 6000,
        action: {
          label: "Lançar no meu extrato",
          onClick: () =>
            openQuickAdd(
              "expense",
              quickAddPreset({ amountCents, description: text, date }),
            ),
        },
      });
    } else {
      toast(`Despesa adicionada em ${groupName}.`);
    }
  }

  return (
    <SheetContent
      title="Adicionar despesas"
      footer={
        <>
          <FieldError id={`${id}-form-error`}>{errors.form}</FieldError>
          <Button
            type="submit"
            form={`${id}-form`}
            size="lg"
            className="w-full"
            loading={add.isPending}
          >
            Adicionar despesa
          </Button>
        </>
      }
    >
      {tabs}
      <form
        id={`${id}-form`}
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-6 pb-2"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-description`}>Descrição</Label>
          <Input
            id={`${id}-description`}
            value={description}
            maxLength={EXPENSE_DESCRIPTION_MAX}
            placeholder="Mercado, aluguel…"
            onChange={(event) => {
              setDescription(event.target.value);
              setErrors((current) => ({ ...current, description: undefined }));
            }}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={
              errors.description ? `${id}-description-error` : undefined
            }
          />
          <FieldError id={`${id}-description-error`}>
            {errors.description}
          </FieldError>
        </div>
        <MoneyField
          id={`${id}-amount`}
          label="Valor"
          value={amount}
          onValueChange={(cents) => {
            setAmount(cents);
            setErrors((current) => ({ ...current, amount: undefined }));
          }}
          error={errors.amount}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-date`}>Data</Label>
          <Input
            id={`${id}-date`}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="tabular-nums"
          />
        </div>
        <SplitEditor
          members={members}
          totalCents={amount}
          draft={draft}
          onDraftChange={setDraft}
          paidBy={{ value: paidBy, onChange: setPaidBy }}
        />
      </form>
    </SheetContent>
  );
}
