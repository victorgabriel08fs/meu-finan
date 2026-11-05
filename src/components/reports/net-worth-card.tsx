"use client";

import type { ReactNode } from "react";
import { StatDelta } from "@/components/app/stat-tile";
import { ChartViewSwitch } from "@/components/charts/chart-view-switch";
import { DataTable } from "@/components/charts/data-table";
import { Sparkline } from "@/components/charts/sparkline";
import { Money } from "@/components/money/money";
import { Card } from "@/components/ui/card";
import { shortMonthLabel } from "@/lib/format/date";
import { formatBRL } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import { netWorthChange, netWorthSummary, type ReportPeriod } from "./model";

type NetWorthCardProps = {
  /** End-of-month net worth, from the month before the window to now. */
  points: { month: string; cents: number }[];
  period: ReportPeriod;
  /** The heading: "Patrimônio líquido" in the report, "Patrimônio" on the Início. */
  title?: string;
  /** Id of the heading, unique on the page. */
  headingId?: string;
  /** Line under the heading ("no fim de setembro", "hoje"). */
  caption?: ReactNode;
  /** On the right of the heading (e.g. "Ver relatório"). */
  action?: ReactNode;
  className?: string;
};

/**
 * "Patrimônio líquido" (doc 02 §6.12): current value, change and a
 * sparkline. The heading sits above the chart and its table alike.
 */
export function NetWorthCard({
  points,
  period,
  title = "Patrimônio líquido",
  headingId = "relatorio-patrimonio",
  caption,
  action,
  className,
}: NetWorthCardProps) {
  const values = points.map((point) => point.cents);
  const { last, delta } = netWorthChange(values);
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const window = period === 1 ? "no mês" : `em ${period} meses`;

  return (
    <Card asChild className={cn("flex flex-col gap-1", className)}>
      <section aria-labelledby={headingId}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h2 id={headingId} className="text-headline text-fg">
              {title}
            </h2>
            {caption ? (
              <p className="text-caption text-fg-3">{caption}</p>
            ) : null}
          </div>
          {action}
        </div>
        <ChartViewSwitch
          chart={
            <div className="flex items-center gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Money cents={last} variant="title" tone="neutral" />
                {values.length > 1 ? (
                  <StatDelta
                    // The arrow stays on the first line when the text wraps.
                    className="items-start [&>svg]:mt-0.5"
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
                  hiddenSummary={netWorthSummary(values, period, {
                    hideValues: true,
                  })}
                />
              ) : null}
            </div>
          }
          table={
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
          }
        />
      </section>
    </Card>
  );
}
