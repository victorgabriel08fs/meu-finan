import Link from "next/link";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { Card } from "@/components/ui/card";
import type { ClosingBudget } from "@/server/domain/month-closing";
import { BudgetSuggestionButton } from "./budget-suggestion-button";
import { budgetSuggestion, budgetsSummary } from "./closing-model";

type ClosingBudgetsCardProps = {
  /** "outubro". */
  monthName: string;
  /** "novembro": where a suggestion is saved. */
  currentMonthName: string;
  /** `YYYY-MM` of the current month. */
  currentMonth: string;
  /** `YYYY-MM` of the closed month, for the link to Orçamentos. */
  month: string;
  metCount: number;
  over: ClosingBudget[];
  /** Suggestions only exist for the last closed month. */
  latest: boolean;
};

const money = (cents: number) => (
  <Money cents={cents} variant="callout" sign="never" tone="neutral" />
);

function Suggestion({
  budget,
  currentMonth,
  currentMonthName,
}: {
  budget: ClosingBudget;
  currentMonth: string;
  currentMonthName: string;
}) {
  const suggestion = budgetSuggestion(budget);
  if (suggestion.kind === "none") return null;
  const average = money(budget.averageCents ?? 0);
  if (suggestion.kind === "covered") {
    return (
      <p className="text-callout text-fg-2">
        {capitalize(currentMonthName)} já tem{" "}
        {money(budget.nextBudgetCents ?? 0)}, que cobre a média dos últimos 3
        meses.
      </p>
    );
  }
  const raise = suggestion.kind === "raise";
  return (
    <>
      <p className="text-callout text-fg-2">
        Média dos últimos 3 meses: {average}.{" "}
        {raise ? (
          <>
            {capitalize(currentMonthName)} tem{" "}
            {money(budget.nextBudgetCents ?? 0)}.
          </>
        ) : (
          <>
            Sugestão para {currentMonthName}: {money(suggestion.suggestedCents)}
            .
          </>
        )}
      </p>
      <BudgetSuggestionButton
        categoryId={budget.categoryId}
        categoryName={budget.categoryName}
        month={currentMonth}
        monthName={currentMonthName}
        amountCents={suggestion.suggestedCents}
        label={raise ? "Usar a sugestão" : `Usar em ${currentMonthName}`}
      />
    </>
  );
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/**
 * "Orçamentos de {mês}" (doc 02 §6.12): kept against over (spent > budgeted,
 * the rule of the Resumo mensal). In the last closed month each over budget
 * offers the average of the last 3 months, rounded up to R$ 10, as the budget
 * of the current month.
 */
export function ClosingBudgetsCard({
  monthName,
  currentMonthName,
  currentMonth,
  month,
  metCount,
  over,
  latest,
}: ClosingBudgetsCardProps) {
  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="fechamento-orcamentos">
        <h2 id="fechamento-orcamentos" className="text-headline text-fg">
          Orçamentos de {monthName}
        </h2>
        <p className="text-callout text-fg-2">
          {budgetsSummary(metCount, over.length)}
        </p>
        {over.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {over.map((budget) => (
              <li
                key={budget.categoryId}
                className="flex flex-col items-start gap-2"
              >
                <div className="flex w-full items-center gap-3">
                  <CategoryIcon
                    icon={budget.categoryIcon}
                    color={budget.categoryColor}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-headline break-words text-fg">
                      {budget.categoryName}
                    </p>
                    <p className="text-caption text-fg-3">
                      <span className="whitespace-nowrap">
                        {money(budget.spentCents)}
                      </span>{" "}
                      <span className="whitespace-nowrap">
                        de {money(budget.budgetCents)}
                      </span>
                    </p>
                    <p className="text-callout font-semibold text-danger">
                      <Money
                        cents={budget.spentCents - budget.budgetCents}
                        variant="callout"
                        sign="never"
                        tone="neutral"
                        className="text-danger"
                      />{" "}
                      acima
                    </p>
                  </div>
                </div>
                {latest ? (
                  <Suggestion
                    budget={budget}
                    currentMonth={currentMonth}
                    currentMonthName={currentMonthName}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <Link
          href={`/planejar/orcamentos?mes=${month}`}
          className="-mb-1.5 inline-flex h-11 w-fit items-center rounded-control px-2 text-callout font-semibold text-primary transition-colors duration-100 hover:bg-primary-soft/60 active:bg-primary-soft"
        >
          Ver orçamentos
        </Link>
      </section>
    </Card>
  );
}

/** The month had no budgets: the last closed month invites to create them. */
export function ClosingNoBudgetsCard({ monthName }: { monthName: string }) {
  return (
    <Card asChild className="flex flex-col items-start gap-3">
      <section aria-labelledby="fechamento-orcamentos">
        <h2 id="fechamento-orcamentos" className="text-headline text-fg">
          Orçamentos de {monthName}
        </h2>
        <p className="text-callout text-fg-2">
          Você não tinha orçamentos em {monthName}.
        </p>
        <Link
          href="/planejar/orcamentos"
          className="-mb-1.5 inline-flex h-11 items-center rounded-control px-2 text-callout font-semibold text-primary transition-colors duration-100 hover:bg-primary-soft/60 active:bg-primary-soft"
        >
          Criar orçamentos
        </Link>
      </section>
    </Card>
  );
}
