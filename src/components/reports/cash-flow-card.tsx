"use client";

import { type ReactNode, useState } from "react";
import { ChartViewSwitch } from "@/components/charts/chart-view-switch";
import { type DataColumn, DataTable } from "@/components/charts/data-table";
import { axisMoneyLabel } from "@/components/charts/format";
import { LegendSwatch } from "@/components/charts/legend";
import { Masked } from "@/components/charts/masked";
import {
  SeriesChart,
  type SeriesSegment,
} from "@/components/charts/series-chart";
import { Money } from "@/components/money/money";
import { Card } from "@/components/ui/card";
import type { CashFlowReport } from "@/server/domain/reports";
import {
  cashFlowSummary,
  cashFlowTicks,
  cashFlowValueText,
  cashFlowXLabels,
  defaultCashFlowIndex,
  pickMarkers,
} from "./cash-flow-model";
import { weekdayDateLabel } from "./day-labels";

type CashFlowCardProps = {
  report: CashFlowReport;
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
  /** Footnote under the chart (e.g. what a projection of a later month leaves out). */
  note?: string;
};

/** The dashed key of the projection (doc 02 §9.2: dashes mean projection). */
function DashedSwatch() {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-4 shrink-0 border-t-2 border-dashed border-primary"
    />
  );
}

/**
 * "Saldo dia a dia" (doc 02 §6.12, Fluxo de caixa): the realized balance as a
 * solid line up to today, the projection dashed to the end of the month,
 * markers on the biggest scheduled items, the day under the finger above the
 * chart and a table twin.
 */
export function CashFlowCard({ report, today, note }: CashFlowCardProps) {
  const { days } = report;
  const [chosen, setChosen] = useState<number | null>(null);
  const selected =
    chosen !== null && chosen < days.length
      ? chosen
      : defaultCashFlowIndex(days, today);
  const day = days[selected];
  const ticks = cashFlowTicks(days);
  const markers =
    report.phase === "past" ? [] : pickMarkers(days, report.scheduled, ticks);
  const todayDay = days.find((item) => item.date === today);
  const hasRealized = days.some((item) => item.realizedCents !== null);
  const hasProjected = days.some((item) => item.projectedCents !== null);

  const segments: SeriesSegment[] = [];
  if (hasRealized) {
    segments.push({
      key: "realizado",
      values: days.map((item) => item.realizedCents),
    });
  }
  if (hasProjected) {
    segments.push({
      key: "previsto",
      values: days.map((item) => item.projectedCents),
      dashed: true,
      joinFrom: todayDay?.realizedCents ?? null,
    });
  }

  const columns: DataColumn[] = [{ key: "day", header: "Dia", align: "start" }];
  if (hasRealized) {
    columns.push({
      key: "realized",
      header: hasProjected ? "Realizado" : "Saldo",
      align: "end",
    });
  }
  if (hasProjected) {
    columns.push({ key: "projected", header: "Previsto", align: "end" });
  }

  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="relatorio-fluxo">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-col">
            <h2 id="relatorio-fluxo" className="text-headline text-fg">
              Saldo dia a dia
            </h2>
            <p className="text-caption text-fg-3">
              Saldo em contas, sem os cartões
            </p>
          </div>
          {hasProjected ? (
            <ul className="flex items-center gap-4 text-caption font-semibold text-fg-2">
              {hasRealized ? (
                <li className="flex items-center gap-1.5">
                  <LegendSwatch color="var(--primary)" shape="line" />
                  Realizado
                </li>
              ) : null}
              <li className="flex items-center gap-1.5">
                <DashedSwatch />
                Previsto
              </li>
            </ul>
          ) : null}
        </div>

        {day ? (
          <div
            aria-live="polite"
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-chip bg-surface-2/70 px-3 py-2.5 text-caption font-semibold text-fg-2"
          >
            <span className="text-callout font-bold text-fg">
              {weekdayDateLabel(day.date)}
              {day.date === today ? " · hoje" : ""}
            </span>
            {day.realizedCents !== null ? (
              <span>
                {hasProjected ? "Realizado " : "Saldo "}
                <Money
                  cents={day.realizedCents}
                  variant="caption"
                  tone="neutral"
                  className="font-bold"
                />
              </span>
            ) : null}
            {day.projectedCents !== null &&
            day.projectedCents !== day.realizedCents ? (
              <span>
                {day.realizedCents !== null ? "Com os atrasados " : "Previsto "}
                <Money
                  cents={day.projectedCents}
                  variant="caption"
                  tone="neutral"
                  className="font-bold"
                />
              </span>
            ) : null}
          </div>
        ) : null}

        <ChartViewSwitch
          note={note}
          chart={
            <SeriesChart
              segments={segments}
              ticks={ticks}
              formatTick={(value) => <Masked>{axisMoneyLabel(value)}</Masked>}
              xLabels={cashFlowXLabels(days, today)}
              markers={markers}
              summary={cashFlowSummary(report, today)}
              scrub={{
                selected,
                onSelectedChange: setChosen,
                label: "Percorrer o saldo dia a dia",
                valueText: (index) => cashFlowValueText(days[index], today),
              }}
              plotClassName="h-44"
            />
          }
          table={
            <DataTable
              caption="Saldo em contas no fim de cada dia"
              columns={columns}
              maxHeightClassName="max-h-80"
              rows={days.map((item) => {
                const cells: ReactNode[] = [];
                if (hasRealized) {
                  cells.push(
                    item.realizedCents === null ? (
                      "—"
                    ) : (
                      <Money
                        key="r"
                        cents={item.realizedCents}
                        variant="caption"
                        tone="neutral"
                      />
                    ),
                  );
                }
                if (hasProjected) {
                  cells.push(
                    item.projectedCents === null ? (
                      "—"
                    ) : (
                      <Money
                        key="p"
                        cents={item.projectedCents}
                        variant="caption"
                        tone="neutral"
                      />
                    ),
                  );
                }
                return {
                  key: item.date,
                  header: `${weekdayDateLabel(item.date)}${item.date === today ? " · hoje" : ""}`,
                  cells,
                  strongLast: item.date === today,
                };
              })}
            />
          }
        />
      </section>
    </Card>
  );
}
