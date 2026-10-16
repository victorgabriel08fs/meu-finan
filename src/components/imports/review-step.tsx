"use client";

import { ArrowDownUp, ChevronDown, Info, TriangleAlert } from "lucide-react";
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { dayHeaderLabel, shortDateLabel } from "@/lib/format/date";
import type { SkipReason } from "@/lib/import/mapping";
import { cn } from "@/lib/utils";
import type { ConfirmImportRow, ReviewRow } from "@/server/domain/imports";
import {
  defaultSelection,
  groupByDay,
  isSelectable,
  matchesFilter,
  orderByDay,
  type ReviewFilter,
  reviewCounts,
  spreadCategory,
} from "./review-model";
import type {
  ImportAccountOption,
  ImportCategoryOption,
  ReviewStage,
} from "./types";

export type ConfirmRequest = {
  rows: ConfirmImportRow[];
  fileRows: number;
  duplicates: number;
};

type ReviewStepProps = {
  data: ReviewStage;
  account: ImportAccountOption;
  categories: ImportCategoryOption[];
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
  confirming: boolean;
  /** Re-reading the file (sign inversion). */
  rereading: boolean;
  error: string | null;
  onConfirm: (request: ConfirmRequest) => void;
  onInvert: (invertSign: boolean) => void;
  /** CSV only: back to the column mapping. */
  onAdjustColumns: (() => void) | null;
  onCancel: () => void;
};

/** Rows rendered at a time; "Mostrar mais" adds another page. */
const PAGE_SIZE = 100;

const SKIP_LABELS: Record<SkipReason, string> = {
  date: "data não reconhecida",
  amount: "valor não reconhecido",
  zero: "valor zerado",
  future: "data muito no futuro",
};

const formatInt = new Intl.NumberFormat("pt-BR");
const plural = (count: number, one: string, many: string) =>
  `${formatInt.format(count)} ${count === 1 ? one : many}`;

/**
 * Step 3 (doc 02 §6.13): every row of the file with a checkbox. Exact
 * duplicates come unchecked (and locked) with "Já existe"; look-alikes of
 * entries typed by hand come unchecked with "Talvez já exista"; the
 * suggested category is a select per row. Counters and filters on top, the
 * import button in a bar that follows the scroll.
 */
export function ReviewStep({
  data,
  account,
  categories,
  today,
  confirming,
  rereading,
  error,
  onConfirm,
  onInvert,
  onAdjustColumns,
  onCancel,
}: ReviewStepProps) {
  const id = useId();
  const rows = data.rows;
  const [selected, setSelected] = useState(() => defaultSelection(rows));
  const [categoryIds, setCategoryIds] = useState(() =>
    rows.map((row) => row.categoryId),
  );
  const [touched, setTouched] = useState<ReadonlySet<number>>(() => new Set());
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const counts = useMemo(() => reviewCounts(rows), [rows]);
  const options = useMemo(
    () => ({
      expense: categories.filter((category) => category.kind === "expense"),
      income: categories.filter((category) => category.kind === "income"),
      byId: new Map(categories.map((category) => [category.id, category])),
    }),
    [categories],
  );
  const visible = useMemo(
    () =>
      orderByDay(
        rows,
        rows.flatMap((row, index) =>
          matchesFilter(row, filter) ? [index] : [],
        ),
      ),
    [rows, filter],
  );
  const groups = useMemo(
    () => groupByDay(rows, visible.slice(0, limit)),
    [rows, visible, limit],
  );
  const payments = rows.filter((row) => row.flag === "payment").length;

  const selectableVisible = visible.filter((index) => {
    const row = rows[index];
    return row !== undefined && isSelectable(row);
  });
  const allChecked =
    selectableVisible.length > 0 &&
    selectableVisible.every((index) => selected.has(index));
  const someChecked = selectableVisible.some((index) => selected.has(index));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someChecked && !allChecked;
    }
  }, [someChecked, allChecked]);

  const selectedCount = selected.size;
  const selectableCount = counts.total - counts.duplicate;

  // Rows are memoised, so their handlers must not change between renders;
  // they read the latest categories through this ref.
  const latest = useRef({ categoryIds, touched });
  useEffect(() => {
    latest.current = { categoryIds, touched };
  });

  const toggle = useCallback((index: number, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  }, []);

  const changeCategory = useCallback(
    (index: number, categoryId: string | null) => {
      const result = spreadCategory(
        rows,
        latest.current.categoryIds,
        latest.current.touched,
        index,
        categoryId,
      );
      const touchedNow = new Set(latest.current.touched).add(index);
      latest.current = { categoryIds: result.categories, touched: touchedNow };
      setCategoryIds(result.categories);
      setTouched(touchedNow);
      if (result.spread > 0) {
        toast(
          `Categoria aplicada também a ${plural(result.spread, "lançamento parecido", "lançamentos parecidos")}.`,
        );
      }
    },
    [rows],
  );

  function toggleVisible() {
    setSelected((current) => {
      const next = new Set(current);
      for (const index of selectableVisible) {
        if (allChecked) next.delete(index);
        else next.add(index);
      }
      return next;
    });
  }

  function confirm() {
    const chosen = [...selected]
      .sort((a, b) => a - b)
      .flatMap((index) => {
        const row = rows[index];
        if (!row || !isSelectable(row)) return [];
        return [
          {
            occurredOn: row.occurredOn,
            amountCents: row.amountCents,
            description: row.description,
            externalId: row.externalId,
            categoryId: categoryIds[index] ?? null,
          },
        ];
      });
    onConfirm({
      rows: chosen,
      fileRows: counts.total,
      duplicates: counts.duplicate,
    });
  }

  const filters: { value: ReviewFilter; label: string; count: number }[] = [
    { value: "all", label: "Todos", count: counts.total },
    { value: "new", label: "Novos", count: counts.fresh },
    { value: "duplicate", label: "Já existem", count: counts.duplicate },
    { value: "maybe", label: "Talvez já existam", count: counts.maybe },
  ];

  return (
    <div className={cn("flex flex-col gap-5", rereading && "opacity-60")}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-title-3 text-fg">Revise os lançamentos</h2>
          <p className="text-body text-fg-2">
            <span className="font-semibold break-all text-fg">
              {data.fileName}
            </span>{" "}
            para <span className="font-semibold text-fg">{account.name}</span>
          </p>
        </div>
        <div className="-mx-2 flex gap-1">
          {onAdjustColumns ? (
            <Button variant="ghost" size="sm" onClick={onAdjustColumns}>
              Ajustar colunas
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Trocar arquivo
          </Button>
        </div>
      </div>

      <p
        className="text-headline text-fg tabular-nums"
        aria-live="polite"
        data-testid="import-counters"
      >
        {plural(counts.fresh, "novo", "novos")}
        {" · "}
        {plural(counts.duplicate, "já existe", "já existem")}
        {counts.maybe > 0
          ? ` · ${plural(counts.maybe, "talvez já exista", "talvez já existam")}`
          : null}
      </p>

      {data.signNotice === "inverted" ? (
        <Notice icon={<ArrowDownUp />}>
          Invertemos os sinais: no arquivo, os gastos vinham como valores
          positivos.{" "}
          <InlineAction disabled={rereading} onClick={() => onInvert(false)}>
            Manter como no arquivo
          </InlineAction>
        </Notice>
      ) : null}
      {data.signNotice === "mostly-positive" ? (
        <Notice icon={<TriangleAlert />} tone="warning">
          Quase tudo veio como entrada de dinheiro. Se forem gastos, inverta os
          sinais.{" "}
          <InlineAction disabled={rereading} onClick={() => onInvert(true)}>
            Inverter sinais
          </InlineAction>
        </Notice>
      ) : null}
      {data.warnings.map((warning) => (
        <Notice key={warning} icon={<Info />}>
          {warning}
        </Notice>
      ))}
      {payments > 0 ? (
        <Notice icon={<Info />}>
          {payments === 1
            ? "O pagamento da fatura ficou desmarcado"
            : `${formatInt.format(payments)} pagamentos da fatura ficaram desmarcados`}
          : no app, ele entra pela conta que pagou, em “Pagar fatura”.
        </Notice>
      ) : null}
      {data.skippedCount > 0 ? (
        <Notice icon={<Info />}>
          <details className="group">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              {plural(
                data.skippedCount,
                "linha do arquivo ficou de fora",
                "linhas do arquivo ficaram de fora",
              )}
              .{" "}
              <span className="font-semibold text-primary underline-offset-2 group-open:hidden hover:underline">
                Ver quais
              </span>
            </summary>
            <ul className="mt-2 flex flex-col gap-0.5">
              {data.skipped.map((line) => (
                <li key={`${line.line}-${line.reason}`}>
                  Linha {line.line}: {SKIP_LABELS[line.reason]}
                </li>
              ))}
              {data.skippedCount > data.skipped.length ? (
                <li>
                  e mais{" "}
                  {formatInt.format(data.skippedCount - data.skipped.length)}
                </li>
              ) : null}
            </ul>
          </details>
        </Notice>
      ) : null}

      <div className="relative -mx-gutter overflow-x-auto px-gutter scrollbar-none [&::-webkit-scrollbar]:hidden">
        <fieldset className="flex w-max gap-2">
          <legend className="sr-only">Filtrar lançamentos</legend>
          {filters
            .filter((item) => item.value === "all" || item.count > 0)
            .map((item) => {
              const active = filter === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setFilter(item.value);
                    setLimit(PAGE_SIZE);
                  }}
                  className={cn(
                    "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-callout font-semibold transition-colors duration-100 after:absolute after:inset-x-0 after:-inset-y-1",
                    active
                      ? "border-transparent bg-primary-soft text-on-primary-soft"
                      : "border-border bg-surface text-fg-2 hover:text-fg",
                  )}
                >
                  {item.label}
                  <span className="tabular-nums opacity-80">
                    {formatInt.format(item.count)}
                  </span>
                </button>
              );
            })}
        </fieldset>
      </div>

      {selectableVisible.length > 0 ? (
        <label className="-my-1 flex min-h-11 cursor-pointer items-center gap-3 self-start px-4 text-callout font-semibold text-fg">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allChecked}
            onChange={toggleVisible}
            className="size-5 shrink-0 accent-primary"
          />
          {allChecked ? "Desmarcar todos" : "Marcar todos"}
          {filter === "all" ? "" : " deste filtro"}
        </label>
      ) : null}

      {groups.length === 0 ? (
        <p className="rounded-card bg-surface px-4 py-8 text-center text-body text-fg-2 shadow-card">
          Nada aqui com esse filtro.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.date} aria-labelledby={`${id}-${group.date}`}>
              <h3
                id={`${id}-${group.date}`}
                className="mb-2 px-1 text-caption font-bold text-fg-2"
              >
                {dayHeaderLabel(group.date, today)}
              </h3>
              <ul className="overflow-hidden rounded-card bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border">
                {group.indexes.map((index) => {
                  const row = rows[index];
                  if (!row) return null;
                  return (
                    <ReviewRowItem
                      key={row.externalId}
                      id={`${id}-row-${index}`}
                      index={index}
                      row={row}
                      today={today}
                      checked={selected.has(index)}
                      onCheckedChange={toggle}
                      categoryId={categoryIds[index] ?? null}
                      options={
                        row.kind === "expense"
                          ? options.expense
                          : options.income
                      }
                      category={options.byId.get(categoryIds[index] ?? "")}
                      onCategoryChange={changeCategory}
                    />
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {visible.length > limit ? (
        <Button
          variant="secondary"
          size="lg"
          className="self-center"
          onClick={() => setLimit((current) => current + PAGE_SIZE)}
        >
          Mostrar mais{" "}
          {formatInt.format(Math.min(PAGE_SIZE, visible.length - limit))}
        </Button>
      ) : null}

      <div className="sticky bottom-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom)+0.75rem)] z-10 lg:bottom-6">
        <div className="flex flex-col gap-2 rounded-card bg-surface p-3 shadow-dialog sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-col gap-1 px-1 sm:flex-1">
            <p
              className="text-callout text-fg-2 tabular-nums"
              aria-live="polite"
            >
              {formatInt.format(selectedCount)} de{" "}
              {formatInt.format(selectableCount)} selecionados
            </p>
            <FieldError id={`${id}-error`}>{error}</FieldError>
          </div>
          <Button
            size="lg"
            className="w-full sm:w-auto sm:min-w-64"
            disabled={selectedCount === 0 || rereading}
            loading={confirming}
            aria-describedby={error ? `${id}-error` : undefined}
            onClick={confirm}
          >
            {selectedCount === 0
              ? "Nenhum lançamento marcado"
              : `Importar ${plural(selectedCount, "lançamento", "lançamentos")}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

type ReviewRowItemProps = {
  id: string;
  /** Position of the row in the file, passed back to the handlers. */
  index: number;
  row: ReviewRow;
  today: string;
  checked: boolean;
  onCheckedChange: (index: number, checked: boolean) => void;
  categoryId: string | null;
  options: ImportCategoryOption[];
  category: ImportCategoryOption | undefined;
  onCategoryChange: (index: number, categoryId: string | null) => void;
};

/**
 * One row: checkbox, description with its badges, amount; the category
 * select goes under the description on phones and in its own column from
 * md up. Memoised: a review can show up to 2.000 rows, and ticking one
 * should not redraw the others.
 */
export const ReviewRowItem = memo(function ReviewRowItem({
  id,
  index,
  row,
  today,
  checked,
  onCheckedChange,
  categoryId,
  options,
  category,
  onCategoryChange,
}: ReviewRowItemProps) {
  const duplicate = row.status === "duplicate";
  const scheduled = row.occurredOn > today;
  return (
    <li
      data-status={row.status}
      className={cn(
        "grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3",
        "md:grid-cols-[1.25rem_minmax(0,1fr)_15rem_7.5rem]",
        duplicate && "bg-surface-2/40",
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={duplicate}
        onChange={(event) => onCheckedChange(index, event.target.checked)}
        aria-describedby={`${id}-amount`}
        className="col-start-1 row-start-1 size-5 shrink-0 accent-primary disabled:opacity-40"
      />
      <label
        htmlFor={id}
        className={cn(
          "col-start-2 row-start-1 flex min-w-0 flex-col gap-1",
          duplicate ? "cursor-default" : "cursor-pointer",
        )}
      >
        <span
          className={cn(
            "truncate text-headline",
            duplicate ? "text-fg-2" : "text-fg",
          )}
        >
          {row.description}
        </span>
        <RowBadges row={row} scheduled={scheduled} />
      </label>
      <span
        id={`${id}-amount`}
        className="col-start-3 row-start-1 justify-self-end md:col-start-4"
      >
        <Money
          cents={row.amountCents}
          variant="headline"
          className={cn(duplicate && "text-fg-3")}
        />
      </span>
      <div className="col-span-2 col-start-2 row-start-2 md:col-span-1 md:col-start-3 md:row-start-1">
        <div className="relative flex items-center">
          {category ? (
            <CategoryIcon
              icon={category.icon}
              color={category.color}
              size="sm"
              className="pointer-events-none absolute left-1.5 size-7"
            />
          ) : null}
          <select
            aria-label={`Categoria de ${row.description}`}
            value={categoryId ?? ""}
            disabled={duplicate}
            onChange={(event) =>
              onCategoryChange(
                index,
                event.target.value === "" ? null : event.target.value,
              )
            }
            className={cn(
              "h-11 w-full min-w-0 appearance-none truncate rounded-control border border-border bg-surface-2/50 pr-9 text-callout font-semibold text-fg",
              "transition-[border-color,box-shadow] duration-100 focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              category ? "pl-10" : "pl-3 text-fg-2",
            )}
          >
            <option value="">
              {row.kind === "expense"
                ? "Despesa sem categoria"
                : "Receita sem categoria"}
            </option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 size-4 text-fg-3"
          />
        </div>
      </div>
    </li>
  );
});

function RowBadges({ row, scheduled }: { row: ReviewRow; scheduled: boolean }) {
  const badges: ReactNode[] = [];
  if (row.status === "duplicate") {
    badges.push(<Badge key="dup">Já existe</Badge>);
  } else if (row.status === "maybe") {
    badges.push(
      <Badge key="maybe" tone="warning">
        Talvez já exista
      </Badge>,
    );
  }
  if (row.flag === "balance") {
    badges.push(<Badge key="balance">Linha de saldo</Badge>);
  } else if (row.flag === "payment") {
    badges.push(
      <Badge key="payment" tone="transfer">
        Pagamento da fatura
      </Badge>,
    );
  }
  if (scheduled) badges.push(<Badge key="scheduled">Agendado</Badge>);
  if (badges.length === 0 && !row.match) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {badges}
      {row.match ? (
        <span className="min-w-0 truncate text-caption text-fg-3">
          Parece com “{row.match.description}”,{" "}
          {shortDateLabel(row.match.occurredOn)}
        </span>
      ) : null}
    </span>
  );
}

function Notice({
  icon,
  tone = "info",
  children,
}: {
  icon: ReactNode;
  tone?: "info" | "warning";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-control px-4 py-3 text-callout",
        tone === "warning"
          ? "bg-warning-soft text-fg"
          : "bg-surface text-fg-2 shadow-card",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 shrink-0 [&_svg]:size-4.5",
          tone === "warning" ? "text-warning" : "text-fg-3",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function InlineAction({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative font-semibold text-primary underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-3 hover:underline disabled:opacity-50"
    >
      {children}
    </button>
  );
}
