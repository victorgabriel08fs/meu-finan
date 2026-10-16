"use client";

import { StatDelta } from "@/components/app/stat-tile";
import { ChartViewSwitch } from "@/components/charts/chart-view-switch";
import { DataTable } from "@/components/charts/data-table";
import { Sparkline } from "@/components/charts/sparkline";
import { Money } from "@/components/money/money";
import { Card } from "@/components/ui/card";
import { shortMonthLabel } from "@/lib/format/date";
import { formatBRL } from "@/lib/format/money";
import { netWorthChange, netWorthSummary, type ReportPeriod } from "./model";

type NetWorthCardProps = {
  /** End-of-month net worth, from the month before the window to now. */
  points: { month: string; cents: number }[];
  period: ReportPeriod;
};

/** "Patrimônio líquido" (doc 02 §6.12): current value, change and a sparkline. */
export function NetWorthCard({ points, period }: NetWorthCardProps) {
  const values = points.map((point) => point.cents);
  const { last, delta } = netWorthChange(values);
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const window = period === 1 ? "no mês" : `em ${period} meses`;

  return (
    <Card asChild className="flex flex-col">
      <section aria-labelledby="relatorio-patrimonio">
        <ChartViewSwitch
          chart={
            <div className="flex items-center gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2
                  id="relatorio-patrimonio"
                  className="text-caption font-semibold text-fg-2"
                >
                  Patrimônio líquido
                </h2>
                <Money cents={last} variant="title" tone="neutral" />
                {values.length > 1 ? (
                  <StatDelta
                    direction={direction}
                    tone={
                      direction === "up"
                        ? "good"
                        : direction === "down"
                          ? "bad"
                          : "neutral"
                    }
                  >
                    <span data-privacy-value="">
                      {delta === 0
                        ? "sem variação"
                        : formatBRL(delta, { sign: "always" })}{" "}
                      {window}
                    </span>
                    <span data-privacy-mask="">R$ •••• {window}</span>
                  </StatDelta>
                ) : null}
              </div>
              {values.length > 1 ? (
                <Sparkline
                  values={values}
                  summary={netWorthSummary(values, period)}
                />
              ) : null}
            </div>
          }
          table={
            <>
              <h2 id="relatorio-patrimonio" className="sr-only">
                Patrimônio líquido
              </h2>
              <DataTable
                caption="Patrimônio líquido no fim de cada mês"
                columns={[
                  { key: "month", header: "Fim de", align: "start" },
                  { key: "value", header: "Patrimônio", align: "end" },
                ]}
                rows={points.map((point) => ({
                  key: point.month,
                  header: shortMonthLabel(point.month),
                  cells: [
                    <Money
                      key="v"
                      cents={point.cents}
                      variant="caption"
                      tone="neutral"
                    />,
                  ],
                  strongLast: true,
                }))}
              />
            </>
          }
        />
      </section>
    </Card>
  );
}
