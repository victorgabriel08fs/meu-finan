"use client";

import { Copy, OctagonAlert, PiggyBank, Plus, Sparkles } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/app/section-header";
import { formatMoneyShort, formatWholeReais } from "@/components/charts/format";
import { ChartLegend } from "@/components/charts/legend";
import { CategoryIcon } from "@/components/finance/category-icon";
import {
  Meter,
  type MeterStatus,
  StatusLabel,
} from "@/components/finance/meter";
import { Money } from "@/components/money/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import type { BudgetPace } from "@/lib/finance/budget";
import { cn } from "@/lib/utils";
import { copyBudgetsAction } from "@/server/actions/planning";
import { useSheetTarget } from "../form/use-sheet";
import {
  type BudgetCategory,
  type EditableBudget,
  EditBudgetSheet,
  NewBudgetSheet,
  SuggestionSheet,
} from "./budget-sheets";
import {
  type BudgetSuggestion,
  budgetRowNote,
  budgetValueText,
  copiedMessage,
  type MonthTiming,
  summaryCaption,
} from "./model";

export type BudgetRow = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  budgetCents: number;
  spentCents: number;
  scheduledCents: number;
  pace: BudgetPace;
};

export type BudgetsViewProps = {
  month: string;
  monthName: string;
  previousMonthName: string;
  timing: MonthTiming;
  items: BudgetRow[];
  total: {
    budgetCents: number;
    spentCents: number;
    scheduledCents: number;
    pace: BudgetPace;
  } | null;
  /** Active expense categories without a budget this month. */
  unbudgeted: BudgetCategory[];
  /** Average monthly spending of the last 3 months, by category id. */
  averages: Readonly<Record<string, number>>;
  /** Budgets of the previous month that this month does not have yet. */
  copyable: number;
  suggestions: BudgetSuggestion[];
};

type SheetTarget =
  | { kind: "edit"; budget: EditableBudget }
  | { kind: "new" }
  | { kind: "suggest" };

/** Planejar › Orçamentos (doc 02 §6.9). */
export function BudgetsView(props: BudgetsViewProps) {
  const {
    month,
    monthName,
    previousMonthName,
    items,
    total,
    copyable,
    suggestions,
  } = props;
  const sheet = useSheetTarget<SheetTarget>();
  const copy = useAction(copyBudgetsAction, {
    onSuccess: ({ data }) =>
      toast(copiedMessage(data?.copied ?? 0, previousMonthName)),
    onError: ({ error }) =>
      toast(
        error.serverError ?? "Não conseguimos copiar. Verifique a conexão.",
      ),
  });

  const copyButton =
    copyable > 0 ? (
      <Button
        variant="secondary"
        className="flex-1"
        loading={copy.isPending}
        onClick={() => copy.execute({ month })}
      >
        <Copy aria-hidden="true" />
        Copiar de {previousMonthName}
      </Button>
    ) : null;

  return (
    <>
      {total && items.length > 0 ? (
        <>
          <BudgetSummary
            total={total}
            categories={items.length}
            monthName={monthName}
            timing={props.timing}
          />
          <section
            aria-labelledby="orcamentos-categorias"
            className="flex flex-col"
          >
            <SectionHeader
              id="orcamentos-categorias"
              title="Por categoria"
              className="mt-2"
            />
            <ul className="overflow-hidden rounded-card bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border">
              {items.map((item) => (
                <li key={item.id}>
                  <BudgetRowButton
                    item={item}
                    showPace={props.timing === "current"}
                    onOpen={() =>
                      sheet.show({
                        kind: "edit",
                        budget: {
                          budgetId: item.id,
                          id: item.categoryId,
                          name: item.categoryName,
                          icon: item.categoryIcon,
                          color: item.categoryColor,
                          budgetCents: item.budgetCents,
                          spentCents: item.spentCents,
                          scheduledCents: item.scheduledCents,
                        },
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="tonal"
              className="flex-1"
              onClick={() => sheet.show({ kind: "new" })}
            >
              <Plus aria-hidden="true" />
              Novo orçamento
            </Button>
            {copyButton}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<PiggyBank />}
          title="Planeje o mês"
          description={
            suggestions.length > 0
              ? `Defina quanto quer gastar por categoria e acompanhe o ritmo. Sugerimos ${formatMoneyShort(
                  suggestions.reduce((sum, item) => sum + item.amountCents, 0),
                )} em ${suggestions.length === 1 ? "1 categoria" : `${suggestions.length} categorias`}, pela média dos últimos 3 meses.`
              : "Defina quanto quer gastar por categoria e acompanhe o ritmo."
          }
          action={
            <>
              {suggestions.length > 0 ? (
                <Button onClick={() => sheet.show({ kind: "suggest" })}>
                  <Sparkles aria-hidden="true" />
                  Usar sugestão
                </Button>
              ) : null}
              {copyButton}
              <Button
                variant={
                  suggestions.length > 0 || copyable > 0 ? "ghost" : "primary"
                }
                onClick={() => sheet.show({ kind: "new" })}
              >
                <Plus aria-hidden="true" />
                Criar orçamento
              </Button>
            </>
          }
        />
      )}

      <Sheet open={sheet.isOpen} onOpenChange={sheet.onOpenChange}>
        {sheet.target?.kind === "edit" ? (
          <EditBudgetSheet
            key={sheet.key}
            budget={sheet.target.budget}
            month={month}
            monthName={monthName}
            averageCents={props.averages[sheet.target.budget.id]}
            onDone={sheet.close}
          />
        ) : null}
        {sheet.target?.kind === "new" ? (
          <NewBudgetSheet
            key={sheet.key}
            categories={props.unbudgeted}
            month={month}
            monthName={monthName}
            averages={props.averages}
            onDone={sheet.close}
          />
        ) : null}
        {sheet.target?.kind === "suggest" ? (
          <SuggestionSheet
            key={sheet.key}
            suggestions={suggestions}
            month={month}
            monthName={monthName}
            onDone={sheet.close}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function BudgetSummary({
  total,
  categories,
  monthName,
  timing,
}: {
  total: NonNullable<BudgetsViewProps["total"]>;
  categories: number;
  monthName: string;
  timing: MonthTiming;
}) {
  const { pace } = total;
  const available = pace.availableCents;
  const over = available < 0;
  const overByScheduled = over && total.spentCents <= total.budgetCents;
  const status = pace.status as MeterStatus;

  const overline =
    timing === "past" && !over
      ? `Sobrou em ${monthName}`
      : `Disponível em ${monthName}`;

  let detail: ReactNode = null;
  if (over) {
    detail = overByScheduled
      ? "Com os agendados, o mês passa do orçado. Dá para rever um valor ou um gasto."
      : "Os gastos já passaram do orçado. Que tal rever as categorias abaixo?";
  } else if (timing === "current" && pace.remainingDays > 0) {
    detail = (
      <>
        <strong className="font-bold text-fg">
          {formatWholeReais(pace.perDayCents)} por dia
        </strong>{" "}
        {pace.remainingDays === 1
          ? "até o fim do mês (hoje é o último dia)"
          : `nos próximos ${pace.remainingDays} dias`}
      </>
    );
  } else if (timing === "future") {
    detail = (
      <>
        <strong className="font-bold text-fg">
          {formatWholeReais(pace.perDayCents)} por dia
        </strong>{" "}
        ao longo de {pace.totalDays} dias
      </>
    );
  }

  return (
    <Card asChild className="flex flex-col gap-2.5 p-5">
      <section aria-labelledby="orcamento-resumo">
        <h2 id="orcamento-resumo" className="text-overline uppercase text-fg-3">
          {overline}
        </h2>
        <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-2">
          <Money
            cents={Math.max(0, available)}
            variant="display"
            tone="neutral"
            sign="never"
          />
          <span className="text-headline text-fg-2">
            {timing === "past" && !over ? "" : "disponíveis"}
          </span>
        </p>
        {over ? (
          <p className="inline-flex items-center gap-1.5 text-callout font-bold text-danger">
            <OctagonAlert aria-hidden="true" className="size-4.5 shrink-0" />
            {formatMoneyShort(-available)} acima do orçado
          </p>
        ) : null}
        {detail ? <p className="text-body text-fg-2">{detail}</p> : null}
        <Meter
          className="mt-2 h-3"
          value={total.spentCents}
          max={total.budgetCents}
          scheduled={total.scheduledCents}
          pace={timing === "current" ? pace.elapsedRatio : undefined}
          status={status}
          label="Orçamento do mês"
          valueText={budgetValueText({
            budgetCents: total.budgetCents,
            spentCents: total.spentCents,
            scheduledCents: total.scheduledCents,
            availableCents: available,
            status: pace.status,
          })}
        />
        <ChartLegend
          layout="stacked"
          className="mt-2 grid-cols-3"
          entries={[
            {
              key: "spent",
              label: "Gasto",
              color: "var(--primary)",
              shape: "square",
              value: formatMoneyShort(total.spentCents),
            },
            {
              key: "scheduled",
              label: "Agendado",
              color: "var(--primary)",
              shape: "hatch",
              value: formatMoneyShort(total.scheduledCents),
            },
            {
              key: "free",
              label: "Livre",
              color: "var(--surface-2)",
              shape: "empty",
              value: formatMoneyShort(Math.max(0, available)),
            },
          ]}
        />
        <p className="mt-1 border-t border-border pt-2.5 text-caption text-fg-3">
          {summaryCaption({
            budgetCents: total.budgetCents,
            categories,
            timing,
            elapsedDays: pace.elapsedDays,
            totalDays: pace.totalDays,
          })}
        </p>
      </section>
    </Card>
  );
}

function BudgetRowButton({
  item,
  showPace,
  onOpen,
}: {
  item: BudgetRow;
  showPace: boolean;
  onOpen: () => void;
}) {
  const line = {
    budgetCents: item.budgetCents,
    spentCents: item.spentCents,
    scheduledCents: item.scheduledCents,
    availableCents: item.pace.availableCents,
    status: item.pace.status,
  };
  const note = budgetRowNote(line);
  const status = item.pace.status as MeterStatus;

  // The button covers the row (a meter cannot live inside a <button>); the
  // drawing on top ignores the pointer and is hidden from screen readers,
  // since the button's name already says everything it shows.
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${item.categoryName}: ${budgetValueText(line)}. ${note.text}. Editar orçamento`}
        className="absolute inset-0 size-full -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none relative flex flex-col gap-2.5 px-4 py-3.5"
      >
        <div className="flex items-center gap-3">
          <CategoryIcon icon={item.categoryIcon} color={item.categoryColor} />
          <span className="min-w-0 flex-1 truncate text-headline text-fg">
            {item.categoryName}
          </span>
          <span className="shrink-0 text-callout font-bold text-fg tabular-nums">
            {formatMoneyShort(item.spentCents)}
            <span className="font-medium text-fg-3">
              {" "}
              / {formatMoneyShort(item.budgetCents)}
            </span>
          </span>
        </div>
        <Meter
          value={item.spentCents}
          max={item.budgetCents}
          scheduled={item.scheduledCents}
          pace={showPace ? item.pace.elapsedRatio : undefined}
          status={status}
          valueText={budgetValueText(line)}
        />
        <div className="flex items-center justify-between gap-3">
          <StatusLabel status={status} />
          <span
            className={cn(
              "truncate text-caption font-semibold tabular-nums",
              note.tone === "danger" ? "text-danger" : "text-fg-3",
            )}
          >
            {note.text}
          </span>
        </div>
      </div>
    </div>
  );
}
