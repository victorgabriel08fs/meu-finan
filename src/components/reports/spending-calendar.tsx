"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useTransition } from "react";
import {
  CalendarHeatmap,
  HeatmapLegend,
} from "@/components/charts/calendar-heatmap";
import { ChartViewSwitch } from "@/components/charts/chart-view-switch";
import { DataTable } from "@/components/charts/data-table";
import { Money } from "@/components/money/money";
import { Card } from "@/components/ui/card";
import type { DaySpending } from "@/server/domain/reports";
import { heatmapDays } from "./calendar-model";
import { weekdayDateLabel } from "./day-labels";

type SpendingCalendarProps = {
  /** Every day of the financial month. */
  days: DaySpending[];
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
  /** "outubro de 2026", for the table names. */
  monthTitle: string;
};

/**
 * "Gastos por dia" (doc 02 §6.12, Calendário): the month as a heatmap of one
 * hue. Choosing a day sets `?dia=` — a real navigation in a transition, so
 * the server lists that day's expenses below while the old list stays
 * dimmed (`data-pending`) — replacing the history entry, so Back leaves the
 * report instead of walking through the days tapped.
 */
export function SpendingCalendar({
  days,
  today,
  monthTitle,
}: SpendingCalendarProps) {
  const [isPending, startTransition] = useTransition();
  const [day, setDay] = useQueryState(
    "dia",
    parseAsString.withOptions({
      shallow: false,
      history: "replace",
      scroll: false,
      startTransition,
    }),
  );
  const selected = days.some((item) => item.date === day) ? day : null;

  return (
    <Card asChild className="flex flex-col gap-3">
      <section
        aria-labelledby="relatorio-calendario"
        data-pending={isPending ? "" : undefined}
      >
        <div className="flex flex-col">
          <h2 id="relatorio-calendario" className="text-headline text-fg">
            Gastos por dia
          </h2>
          <p className="text-caption text-fg-3">
            Despesas pagas; no cartão, na data da compra
          </p>
        </div>
        <ChartViewSwitch
          chart={
            // Near-square cells on wide cards; the outer cells line up with
            // the card padding (the table spaces its edges too).
            <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
              <CalendarHeatmap
                days={heatmapDays(days, today)}
                selected={selected}
                onSelect={(date) => void setDay(date)}
                caption={`Gastos por dia em ${monthTitle}. Escolha um dia para ver as despesas.`}
                className="-mx-1 w-[calc(100%+0.5rem)]"
              />
              <HeatmapLegend />
            </div>
          }
          table={
            <DataTable
              caption={`Gastos por dia em ${monthTitle}`}
              columns={[
                { key: "day", header: "Dia", align: "start" },
                { key: "count", header: "Despesas", align: "end" },
                { key: "total", header: "Total", align: "end" },
              ]}
              maxHeightClassName="max-h-80"
              rows={days.map((item) => {
                const future = item.date > today;
                const count = future ? item.pendingCount : item.paidCount;
                const cents = future ? item.pendingCents : item.paidCents;
                return {
                  key: item.date,
                  header: `${weekdayDateLabel(item.date)}${
                    item.date === today ? " · hoje" : future ? " · a vir" : ""
                  }`,
                  cells: [
                    count === 0
                      ? "—"
                      : future
                        ? `${count} ${count === 1 ? "agendada" : "agendadas"}`
                        : String(count),
                    count === 0 ? (
                      "—"
                    ) : (
                      <Money
                        key="t"
                        cents={cents}
                        variant="caption"
                        tone="neutral"
                      />
                    ),
                  ],
                  strongLast: true,
                };
              })}
            />
          }
        />
      </section>
    </Card>
  );
}
