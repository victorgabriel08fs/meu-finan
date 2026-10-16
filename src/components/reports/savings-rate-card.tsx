"use client";

import { ChartViewSwitch } from "@/components/charts/chart-view-switch";
import { DataTable } from "@/components/charts/data-table";
import { axisPercentLabel, monthAbbrev } from "@/components/charts/format";
import { LineChart } from "@/components/charts/line-chart";
import { niceTicks } from "@/components/charts/scale";
import { Card } from "@/components/ui/card";
import { shortMonthLabel } from "@/lib/format/date";
import { formatPercent } from "@/lib/format/number";
import { highlightIndices, savingsSummary } from "./model";

type SavingsRateCardProps = {
  /** Complete months only, oldest first. */
  months: string[];
  /** (income − expenses) / income per month; null without income. */
  rates: (number | null)[];
};

/**
 * "Taxa de poupança" (doc 02 §6.12): its own small line chart (never a
 * second axis on the columns), complete months only, peak/low/last labelled.
 */
export function SavingsRateCard({ months, rates }: SavingsRateCardProps) {
  const known = rates.filter((rate): rate is number => rate !== null);
  const ticks = niceTicks(Math.min(0, ...known), Math.max(0, ...known), 2);
  const first = months[0];
  const last = months.at(-1);

  return (
    <Card asChild className="flex flex-col gap-1">
      <section aria-labelledby="relatorio-poupanca">
        <h2 id="relatorio-poupanca" className="text-headline text-fg">
          Taxa de poupança
        </h2>
        <p className="text-caption text-fg-3">
          Quanto da receita sobrou em cada mês completo
        </p>
        {known.length === 0 ? (
          <p className="py-6 text-callout text-fg-2">
            Aparece aqui quando o período tiver um mês completo com receita.
          </p>
        ) : (
          <ChartViewSwitch
            chart={
              <LineChart
                values={rates}
                ticks={ticks}
                formatTick={axisPercentLabel}
                summary={savingsSummary(months, rates)}
                labels={highlightIndices(rates).map((index) => ({
                  index,
                  text: `${monthAbbrev(months[index] ?? "")} ${formatPercent(rates[index] ?? 0)}`,
                }))}
                xLabels={
                  first && last && first !== last
                    ? [
                        { position: 0, label: shortMonthLabel(first) },
                        { position: 1, label: shortMonthLabel(last) },
                      ]
                    : first
                      ? [{ position: 0.5, label: shortMonthLabel(first) }]
                      : []
                }
                className="mt-1"
              />
            }
            table={
              <DataTable
                caption="Taxa de poupança por mês"
                columns={[
                  { key: "month", header: "Mês", align: "start" },
                  { key: "rate", header: "Taxa", align: "end" },
                ]}
                rows={months.map((month, index) => {
                  const rate = rates[index];
                  return {
                    key: month,
                    header: shortMonthLabel(month),
                    cells: [
                      rate === null || rate === undefined
                        ? "sem receita"
                        : formatPercent(rate),
                    ],
                    strongLast: true,
                  };
                })}
              />
            }
          />
        )}
      </section>
    </Card>
  );
}
