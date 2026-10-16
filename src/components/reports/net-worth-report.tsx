"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { StatDelta } from "@/components/app/stat-tile";
import { ChartViewSwitch } from "@/components/charts/chart-view-switch";
import { DataTable } from "@/components/charts/data-table";
import { axisMoneyLabel } from "@/components/charts/format";
import { Masked } from "@/components/charts/masked";
import { SeriesChart } from "@/components/charts/series-chart";
import { Money } from "@/components/money/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { shortMonthLabel } from "@/lib/format/date";
import { formatBRL } from "@/lib/format/money";
import type { NetWorthBreakdownPoint } from "@/server/domain/reports";
import { netWorthChange, type ReportPeriod } from "./model";
import {
  BREAKDOWN_LABELS,
  type BreakdownKey,
  breakdownSummary,
  breakdownTicks,
  breakdownValueText,
  breakdownXLabels,
  deltaTone,
  pointLabel,
  windowLabel,
} from "./net-worth-model";

type NetWorthReportProps = {
  /** End of each month, from the month before the window to today. */
  points: NetWorthBreakdownPoint[];
  period: ReportPeriod;
};

const formatTick = (value: number) => <Masked>{axisMoneyLabel(value)}</Masked>;

/** The change over the window, colored by meaning (§5.11). */
function Change({
  name,
  values,
  period,
}: {
  name: BreakdownKey;
  values: readonly number[];
  period: ReportPeriod;
}) {
  const { delta } = netWorthChange(values);
  const window = windowLabel(period);
  return (
    <StatDelta
      direction={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}
      tone={deltaTone(name, delta)}
    >
      <span data-privacy-value="">
        {delta === 0 ? "sem variação" : formatBRL(delta, { sign: "always" })}{" "}
        {window}
      </span>
      <span data-privacy-mask="">R$ •••• {window}</span>
    </StatDelta>
  );
}

const monthHeader = (
  points: readonly NetWorthBreakdownPoint[],
  index: number,
) => {
  const point = points[index];
  if (!point) return "";
  return index === points.length - 1
    ? `${shortMonthLabel(point.month)} (hoje)`
    : shortMonthLabel(point.month);
};

/**
 * Patrimônio (doc 02 §6.12): net worth month by month as a single-series
 * area with a scrub, then assets and liabilities as small multiples — two
 * charts with their own axes, never a second axis — following the month
 * picked above, and the way to the per-account balances in Contas.
 */
export function NetWorthReport({ points, period }: NetWorthReportProps) {
  const [chosen, setChosen] = useState<number | null>(null);
  const last = points.length - 1;
  const selected = chosen !== null && chosen <= last ? chosen : last;
  const point = points[selected];
  const net = points.map((item) => item.netCents);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
      <Card asChild className="flex flex-col gap-3 md:col-span-2">
        <section aria-labelledby="relatorio-patrimonio-liquido">
          <div className="flex flex-col gap-1">
            <h2
              id="relatorio-patrimonio-liquido"
              className="text-caption font-semibold text-fg-2"
            >
              {BREAKDOWN_LABELS.netCents.title}
            </h2>
            <Money cents={net.at(-1) ?? 0} variant="title" tone="neutral" />
            {net.length > 1 ? (
              <Change name="netCents" values={net} period={period} />
            ) : null}
          </div>

          {point ? (
            <div
              aria-live="polite"
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-chip bg-surface-2/70 px-3 py-2.5 text-caption font-semibold text-fg-2"
            >
              <span className="text-callout font-bold text-fg">
                {pointLabel(points, selected).replace(/^./, (letter) =>
                  letter.toUpperCase(),
                )}
              </span>
              <span>
                Patrimônio{" "}
                <Money
                  cents={point.netCents}
                  variant="caption"
                  tone="neutral"
                  className="font-bold"
                />
              </span>
              <span>
                Ativos{" "}
                <Money
                  cents={point.assetsCents}
                  variant="caption"
                  tone="neutral"
                  className="font-bold"
                />
              </span>
              <span>
                Passivos{" "}
                <Money
                  cents={point.liabilitiesCents}
                  variant="caption"
                  tone="neutral"
                  className="font-bold"
                />
              </span>
            </div>
          ) : null}

          <ChartViewSwitch
            chart={
              <SeriesChart
                segments={[{ key: "patrimonio", values: net, area: true }]}
                ticks={breakdownTicks(net)}
                formatTick={formatTick}
                xLabels={breakdownXLabels(points)}
                summary={breakdownSummary("netCents", net, period)}
                scrub={{
                  selected,
                  onSelectedChange: setChosen,
                  label: "Percorrer o patrimônio mês a mês",
                  valueText: (index) => breakdownValueText(points, index),
                }}
              />
            }
            table={
              <DataTable
                caption="Patrimônio, ativos e passivos no fim de cada mês"
                columns={[
                  { key: "month", header: "Fim de", align: "start" },
                  { key: "assets", header: "Ativos", align: "end" },
                  { key: "liabilities", header: "Passivos", align: "end" },
                  { key: "net", header: "Patrimônio", align: "end" },
                ]}
                rows={points.map((item, index) => ({
                  key: item.month,
                  header: monthHeader(points, index),
                  cells: [
                    <Money
                      key="a"
                      cents={item.assetsCents}
                      variant="caption"
                      tone="neutral"
                    />,
                    <Money
                      key="l"
                      cents={item.liabilitiesCents}
                      variant="caption"
                      tone="neutral"
                    />,
                    <Money
                      key="n"
                      cents={item.netCents}
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

      <BreakdownCard
        name="assetsCents"
        points={points}
        period={period}
        selected={selected}
      />
      <BreakdownCard
        name="liabilitiesCents"
        points={points}
        period={period}
        selected={selected}
      />

      <div className="md:col-span-2">
        <Button asChild variant="secondary" className="w-full md:w-auto">
          <Link href="/contas">
            Ver o saldo de cada conta
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** One of the small multiples: its own value, change, axis and table. */
function BreakdownCard({
  name,
  points,
  period,
  selected,
}: {
  name: "assetsCents" | "liabilitiesCents";
  points: readonly NetWorthBreakdownPoint[];
  period: ReportPeriod;
  selected: number;
}) {
  const { title } = BREAKDOWN_LABELS[name];
  const values = points.map((item) => item[name]);
  const id = name === "assetsCents" ? "relatorio-ativos" : "relatorio-passivos";
  return (
    <Card asChild className="flex flex-col gap-1">
      <section aria-labelledby={id}>
        <h2 id={id} className="text-caption font-semibold text-fg-2">
          {title}
        </h2>
        <Money cents={values.at(-1) ?? 0} variant="title" tone="neutral" />
        {values.length > 1 ? (
          <Change name={name} values={values} period={period} />
        ) : null}
        <ChartViewSwitch
          chart={
            <SeriesChart
              segments={[{ key: name, values, area: true }]}
              ticks={breakdownTicks(values, 2)}
              formatTick={formatTick}
              xLabels={breakdownXLabels(points)}
              summary={breakdownSummary(name, values, period)}
              highlight={selected}
              plotClassName="h-24"
              className="mt-1"
            />
          }
          table={
            <DataTable
              caption={`${title} no fim de cada mês`}
              columns={[
                { key: "month", header: "Fim de", align: "start" },
                { key: "value", header: title, align: "end" },
              ]}
              rows={points.map((item, index) => ({
                key: item.month,
                header: monthHeader(points, index),
                cells: [
                  <Money
                    key="v"
                    cents={item[name]}
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
