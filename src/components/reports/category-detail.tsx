"use client";

import { useState } from "react";
import { ChartViewSwitch } from "@/components/charts/chart-view-switch";
import { DataTable } from "@/components/charts/data-table";
import {
  axisMoneyLabel,
  monthAbbrev,
  monthName,
  spokenMoney,
} from "@/components/charts/format";
import { GroupedColumnChart } from "@/components/charts/grouped-column-chart";
import { Masked } from "@/components/charts/masked";
import { niceTicks } from "@/components/charts/scale";
import { Money } from "@/components/money/money";
import { Card } from "@/components/ui/card";
import { monthLabel } from "@/lib/format/date";

export type CategoryMonth = {
  month: string;
  cents: number;
  partial: boolean;
};

type CategoryMonthsCardProps = {
  months: CategoryMonth[];
  /** "Mercado" or "Mercado › Feira", for the table and the spoken labels. */
  label: string;
  kind: "expense" | "income";
};

/**
 * "Mês a mês" of a category's detail (doc 02 §6.12, §9): one series of
 * columns in the color of its type (laranja for despesas, água for
 * receitas), the selected month's value above, the running month marked
 * partial and the table twin.
 */
export function CategoryMonthsCard({
  months,
  label,
  kind,
}: CategoryMonthsCardProps) {
  const lastComplete = months.findLastIndex((month) => !month.partial);
  const fallback = lastComplete >= 0 ? lastComplete : months.length - 1;
  const [chosen, setChosen] = useState<number | null>(null);
  const selected =
    chosen !== null && chosen < months.length ? chosen : fallback;
  const point = months[selected];
  const partial = months.find((month) => month.partial);
  const noun = kind === "expense" ? "Despesas" : "Receitas";
  const color = kind === "expense" ? "var(--chart-2)" : "var(--chart-3)";
  const rest =
    kind === "expense" ? "var(--chart-2-rest)" : "var(--chart-3-rest)";
  const ticks = niceTicks(
    0,
    Math.max(0, ...months.map((item) => item.cents)),
    4,
  );

  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="categoria-mes-a-mes">
        <h2 id="categoria-mes-a-mes" className="text-headline text-fg">
          Mês a mês
        </h2>
        {point ? (
          <div
            aria-live="polite"
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-chip bg-surface-2/70 px-3 py-2.5 text-caption font-semibold text-fg-2"
          >
            <span className="text-callout font-bold text-fg">
              {monthName(point.month)}
              {point.partial ? " (parcial)" : ""}
            </span>
            <Money
              cents={point.cents}
              variant="caption"
              tone="neutral"
              sign="never"
              className="font-bold"
            />
          </div>
        ) : null}
        <ChartViewSwitch
          note={partial ? `* ${monthName(partial.month)} parcial` : undefined}
          chart={
            <GroupedColumnChart
              label={`${noun} de ${label} por mês; escolha um mês para ver o valor`}
              series={[{ key: "cents", label: noun, color, restColor: rest }]}
              groups={months.map((month) => ({
                key: month.month,
                label: monthAbbrev(month.month),
                partial: month.partial,
                values: [month.cents],
              }))}
              selected={selected}
              onSelect={setChosen}
              ticks={ticks}
              formatTick={(value) => <Masked>{axisMoneyLabel(value)}</Masked>}
              describeGroup={(index, hideValues) => {
                const month = months[index];
                return month
                  ? `${monthLabel(month.month)}${month.partial ? " (parcial)" : ""}: ${spokenMoney(month.cents, { hideValues })}`
                  : "";
              }}
            />
          }
          table={
            <DataTable
              caption={`${noun} de ${label} por mês`}
              columns={[
                { key: "month", header: "Mês", align: "start" },
                { key: "cents", header: noun, align: "end" },
              ]}
              rows={months.map((month) => ({
                key: month.month,
                header: `${monthAbbrev(month.month)}/${month.month.slice(2, 4)}${month.partial ? "*" : ""}`,
                cells: [
                  <Money
                    key="c"
                    cents={month.cents}
                    variant="caption"
                    tone="neutral"
                    sign="never"
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
