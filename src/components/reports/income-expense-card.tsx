"use client";

import { useState } from "react";
import { ChartViewSwitch } from "@/components/charts/chart-view-switch";
import { DataTable } from "@/components/charts/data-table";
import {
  axisMoneyLabel,
  formatMoneyShort,
  monthAbbrev,
  monthName,
} from "@/components/charts/format";
import { GroupedColumnChart } from "@/components/charts/grouped-column-chart";
import { ChartLegend } from "@/components/charts/legend";
import { Masked } from "@/components/charts/masked";
import { niceTicks } from "@/components/charts/scale";
import { Money } from "@/components/money/money";
import { Card } from "@/components/ui/card";
import { monthLabel } from "@/lib/format/date";
import type { MonthTotals } from "./model";

const INCOME = "var(--chart-3)";
const EXPENSE = "var(--chart-2)";

type IncomeExpenseCardProps = {
  months: MonthTotals[];
  defaultSelected: number | null;
  /** Spoken summary of the whole chart. */
  summary: string;
  /** "Dia 14 de 31": how far the partial month went. */
  partialProgress: string | null;
};

/**
 * "Receitas × despesas" (doc 02 §6.12, §9): grouped columns per month in
 * água × laranja, the selected month's values above the chart, the running
 * month marked partial and a table view.
 */
export function IncomeExpenseCard({
  months,
  defaultSelected,
  summary,
  partialProgress,
}: IncomeExpenseCardProps) {
  const [chosen, setSelected] = useState(defaultSelected);
  // A shorter period may leave an old index behind: fall back to the default.
  const selected =
    chosen !== null && chosen < months.length ? chosen : defaultSelected;
  const point = selected === null ? null : months[selected];
  const max = Math.max(
    0,
    ...months.flatMap((month) => [month.incomeCents, month.expenseCents]),
  );
  const ticks = niceTicks(0, max, 4);
  const partial = months.find((month) => month.partial);

  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="relatorio-receitas-despesas">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2
            id="relatorio-receitas-despesas"
            className="text-headline text-fg"
          >
            Receitas × despesas
          </h2>
          <ChartLegend
            entries={[
              { key: "income", label: "Receitas", color: INCOME },
              { key: "expense", label: "Despesas", color: EXPENSE },
            ]}
          />
        </div>
        <p className="sr-only">{summary}</p>

        {point ? (
          <div
            aria-live="polite"
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-chip bg-surface-2/70 px-3 py-2.5 text-caption font-semibold text-fg-2"
          >
            <span className="text-callout font-bold text-fg">
              {monthName(point.month)}
              {point.partial ? " (parcial)" : ""}
            </span>
            <span>
              Receitas{" "}
              <Money
                cents={point.incomeCents}
                variant="caption"
                tone="neutral"
                className="font-bold"
              />
            </span>
            <span>
              Despesas{" "}
              <Money
                cents={point.expenseCents}
                variant="caption"
                tone="neutral"
                className="font-bold"
              />
            </span>
            <span>
              Saldo{" "}
              <Money
                cents={point.incomeCents - point.expenseCents}
                variant="caption"
                sign="always"
                className="font-bold"
              />
            </span>
          </div>
        ) : null}

        <ChartViewSwitch
          note={
            partial
              ? `* ${monthName(partial.month)} parcial${partialProgress ? ` (${partialProgress})` : ""}`
              : undefined
          }
          chart={
            <GroupedColumnChart
              label="Receitas e despesas por mês; escolha um mês para ver os valores"
              series={[
                { key: "income", label: "Receitas", color: INCOME },
                { key: "expense", label: "Despesas", color: EXPENSE },
              ]}
              groups={months.map((month) => ({
                key: month.month,
                label: monthAbbrev(month.month),
                partial: month.partial,
                values: [month.incomeCents, month.expenseCents],
              }))}
              selected={selected}
              onSelect={setSelected}
              ticks={ticks}
              formatTick={(value) => <Masked>{axisMoneyLabel(value)}</Masked>}
              describeGroup={(index) => {
                const month = months[index];
                if (!month) return "";
                return `${monthLabel(month.month)}${month.partial ? " (parcial)" : ""}: receitas ${formatMoneyShort(
                  month.incomeCents,
                )}, despesas ${formatMoneyShort(month.expenseCents)}`;
              }}
            />
          }
          table={
            <DataTable
              caption="Receitas e despesas por mês"
              columns={[
                { key: "month", header: "Mês", align: "start" },
                { key: "income", header: "Receitas", align: "end" },
                { key: "expense", header: "Despesas", align: "end" },
                { key: "balance", header: "Saldo", align: "end" },
              ]}
              rows={months.map((month) => ({
                key: month.month,
                header: `${monthAbbrev(month.month)}/${month.month.slice(2, 4)}${month.partial ? "*" : ""}`,
                cells: [
                  <Money
                    key="i"
                    cents={month.incomeCents}
                    variant="caption"
                    tone="neutral"
                  />,
                  <Money
                    key="e"
                    cents={month.expenseCents}
                    variant="caption"
                    tone="neutral"
                  />,
                  <Money
                    key="b"
                    cents={month.incomeCents - month.expenseCents}
                    variant="caption"
                    sign="always"
                  />,
                ],
                strongLast: true,
              }))}
            />
          }
        />
      </section>
    </Card>
  );
}
