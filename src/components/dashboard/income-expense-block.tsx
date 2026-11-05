import { ChartColumn } from "lucide-react";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import {
  IncomeExpenseChart,
  IncomeExpenseLegend,
} from "@/components/reports/income-expense-card";
import {
  defaultSelectedMonth,
  incomeExpenseSummary,
  type MonthTotals,
} from "@/components/reports/model";
import { Card } from "@/components/ui/card";
import { BlockInvite } from "./block-invite";
import { BlockLink } from "./block-link";

type IncomeExpenseBlockProps = {
  /** The last 6 months, the one the series ends in last. */
  months: MonthTotals[];
  /** "outubro": the month the series ends in. */
  endMonthName: string;
  /** "até o dia 14 de 31" when the running month is in the series. */
  partialProgress: string | null;
  reportHref: string;
};

/** Months on the Início: the report's 6M. */
export const INCOME_EXPENSE_BLOCK_MONTHS = 6;

/**
 * Receitas × despesas on the Início (doc 02 §6.3, §6.12): the report's
 * grouped columns for the 6 months up to the one on screen (up to today's
 * for a month ahead), the selected month's values above them.
 */
export function IncomeExpenseBlock({
  months,
  endMonthName,
  partialProgress,
  reportHref,
}: IncomeExpenseBlockProps) {
  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="inicio-receitas-despesas">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h2 id="inicio-receitas-despesas" className="text-headline text-fg">
              Receitas × despesas por mês
            </h2>
            <p className="text-caption text-fg-3">
              Últimos {INCOME_EXPENSE_BLOCK_MONTHS} meses, até {endMonthName}
            </p>
          </div>
          <BlockLink href={reportHref}>Ver relatório</BlockLink>
        </div>
        <IncomeExpenseLegend />
        {/* Another series starts on its own default month. */}
        <IncomeExpenseChart
          key={months.at(-1)?.month}
          months={months}
          defaultSelected={defaultSelectedMonth(months)}
          summary={incomeExpenseSummary(months)}
          hiddenSummary={incomeExpenseSummary(months, { hideValues: true })}
          partialProgress={partialProgress}
        />
      </section>
    </Card>
  );
}

/** Six months without income or expenses. */
export function IncomeExpenseInvite() {
  return (
    <BlockInvite
      icon={<ChartColumn />}
      title={`Nenhuma receita ou despesa em ${INCOME_EXPENSE_BLOCK_MONTHS} meses`}
      description="Com seus lançamentos, o gráfico compara o que entrou e saiu a cada mês."
      action={
        <QuickAddButton kind="expense" variant="tonal" size="sm">
          Adicionar lançamento
        </QuickAddButton>
      }
    />
  );
}
