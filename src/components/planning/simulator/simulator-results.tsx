"use client";

import { ChevronDown, Lightbulb, PiggyBank, TrendingUp } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { DataTable } from "@/components/charts/data-table";
import { axisMoneyLabel, formatMoneyShort } from "@/components/charts/format";
import { ChartLegend, LegendSwatch } from "@/components/charts/legend";
import { niceTicks } from "@/components/charts/scale";
import { SplitBar } from "@/components/charts/split-bar";
import { StackedAreaChart } from "@/components/charts/stacked-area-chart";
import { Money } from "@/components/money/money";
import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import {
  axisDuration,
  type Insight,
  pointLabel,
  type SimulationView,
  toCents,
} from "./model";

const INVESTED = "var(--chart-1)";
const INTEREST = "var(--chart-3)";

/** Whole reais, rounded: projections are estimates, cents are noise. */
const wholeReais = (cents: number) =>
  formatMoneyShort(Math.round(cents / 100) * 100);

const COUNT_UP_MS = 320;

/**
 * Hero value that counts from the previous result to the new one (doc 02
 * §6.11 "contagem animada"); jumps straight there with reduced motion.
 */
function useCountUp(target: number): number {
  const [value, setValue] = useState(target);
  const shown = useRef(target);

  useEffect(() => {
    const from = shown.current;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (from === target || reduce) {
      shown.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.round(from + (target - from) * eased);
      shown.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

function AnimatedMoney({ cents }: { cents: number }) {
  const value = useCountUp(cents);
  return <Money cents={value} variant="display" tone="neutral" />;
}

export function HeroCard({
  view,
  heroRef,
}: {
  view: SimulationView;
  heroRef: RefObject<HTMLDivElement | null>;
}) {
  const { final, hero } = view;
  const total = Math.max(final.grossCents, 1);
  const investedShare = Math.min(
    100,
    Math.max(0, Math.round((final.investedCents / total) * 100)),
  );
  const interestShare = Math.max(0, 100 - investedShare);

  return (
    <div ref={heroRef}>
      <Card asChild className="flex flex-col gap-3 p-5">
        <section aria-label="Resultado da simulação">
          <div className="flex flex-col gap-1">
            <p className="text-body font-semibold text-fg-2">{hero.label}</p>
            {hero.kind === "money" ? (
              <p className="flex flex-wrap items-baseline gap-x-2">
                {/* The count-up is visual only; the live region below speaks the final value once. */}
                <span aria-hidden="true">
                  <AnimatedMoney cents={hero.cents} />
                </span>
                {hero.suffix ? (
                  <span aria-hidden="true" className="text-headline text-fg-2">
                    {hero.suffix}
                  </span>
                ) : null}
              </p>
            ) : (
              <p aria-hidden="true" className="text-title-1 text-fg">
                {hero.text}
              </p>
            )}
            <p aria-live="polite" aria-atomic="true" className="sr-only">
              {hero.label}{" "}
              {hero.kind === "money"
                ? `${formatBRL(hero.cents)}${hero.suffix ? ` ${hero.suffix}` : ""}`
                : hero.text}
            </p>
          </div>
          {view.chips.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {view.chips.map((chip) => (
                <li
                  key={chip.key}
                  className={cn(
                    "inline-flex min-h-7.5 items-center rounded-full px-3 py-1 text-caption font-bold tabular-nums",
                    chip.tone === "primary"
                      ? "bg-primary-soft text-on-primary-soft"
                      : "bg-surface-2 text-fg-2",
                  )}
                >
                  {chip.text}
                </li>
              ))}
            </ul>
          ) : null}
          <SplitBar
            className="mt-1.5"
            summary={`Investido ${wholeReais(final.investedCents)}, ${investedShare}%; juros ${wholeReais(final.interestCents)}, ${interestShare}%`}
            segments={[
              {
                key: "invested",
                value: Math.max(0, final.investedCents),
                color: INVESTED,
              },
              {
                key: "interest",
                value: Math.max(0, final.interestCents),
                color: INTEREST,
              },
            ]}
          />
          <ChartLegend
            layout="stacked"
            entries={[
              {
                key: "invested",
                label: `Investido · ${investedShare}%`,
                color: INVESTED,
                value: wholeReais(final.investedCents),
              },
              {
                key: "interest",
                label: `Juros · ${interestShare}%`,
                color: INTEREST,
                value: wholeReais(final.interestCents),
              },
            ]}
          />
        </section>
      </Card>
    </div>
  );
}

export function EvolutionCard({
  view,
  selected,
  onSelect,
}: {
  view: SimulationView;
  selected: number | null;
  onSelect: (stopIndex: number) => void;
}) {
  const chart = view.chart;
  if (!chart) return null;
  const stopIndex = selected ?? chart.stops.length - 1;
  const month = chart.stops[stopIndex] ?? view.months;
  const invested = chart.invested[month] ?? 0;
  const interest = chart.interest[month] ?? 0;
  const ticks = niceTicks(0, chart.maxBalanceCents / 100, 3);
  const crossover =
    view.crossoverMonth !== null && view.crossoverMonth <= view.months
      ? { index: view.crossoverMonth, label: "juros > aporte" }
      : null;
  const describe = (index: number) => {
    const at = chart.stops[index] ?? 0;
    const atInvested = chart.invested[at] ?? 0;
    const atInterest = chart.interest[at] ?? 0;
    return `${pointLabel(at)}: total ${wholeReais(toCents(atInvested + atInterest))}, investido ${wholeReais(
      toCents(atInvested),
    )}, juros ${wholeReais(toCents(atInterest))}`;
  };

  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="simulador-evolucao">
        <div className="flex items-center justify-between gap-3">
          <h2 id="simulador-evolucao" className="text-headline text-fg">
            Evolução
          </h2>
          <span className="inline-flex h-6.5 items-center rounded-full bg-surface-2 px-2.5 text-caption font-bold text-fg tabular-nums">
            {pointLabel(month)}
          </span>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption font-semibold text-fg-2">
          <li className="flex items-center gap-1.5">
            <LegendSwatch color={INVESTED} />
            Investido
            <strong className="text-fg tabular-nums">
              {wholeReais(toCents(invested))}
            </strong>
          </li>
          <li className="flex items-center gap-1.5">
            <LegendSwatch color={INTEREST} />
            Juros
            <strong className="text-fg tabular-nums">
              {wholeReais(toCents(interest))}
            </strong>
          </li>
          <li className="flex items-center gap-1.5">
            Total
            <strong className="text-fg tabular-nums">
              {wholeReais(toCents(invested + interest))}
            </strong>
          </li>
        </ul>
        <StackedAreaChart
          layers={[
            {
              key: "invested",
              label: "Investido",
              color: INVESTED,
              values: chart.invested,
            },
            {
              key: "interest",
              label: "Juros",
              color: INTEREST,
              values: chart.interest,
            },
          ]}
          stops={chart.stops}
          selected={stopIndex}
          onSelectedChange={onSelect}
          scrubLabel={
            chart.stops.length > view.months
              ? "Percorrer o gráfico mês a mês"
              : "Percorrer o gráfico ano a ano"
          }
          valueText={describe}
          ticks={ticks}
          formatTick={(value) => axisMoneyLabel(toCents(value))}
          xLabels={[
            { position: 0, label: "hoje" },
            ...(view.months >= 4
              ? [
                  {
                    position: 0.5,
                    label: axisDuration(Math.round(view.months / 2)),
                  },
                ]
              : []),
            { position: 1, label: axisDuration(view.months) },
          ]}
          marker={crossover}
          plotClassName="h-40 lg:h-56"
        />
        <p className="text-caption text-fg-3">
          Arraste sobre o gráfico, ou use as setas, para ver cada{" "}
          {chart.stops.length > view.months ? "mês" : "ano"}.
        </p>
      </section>
    </Card>
  );
}

const INSIGHT_ICON: Record<Insight["icon"], typeof TrendingUp> = {
  trend: TrendingUp,
  income: Lightbulb,
  savings: PiggyBank,
};

export function InsightsCard({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <Card asChild>
      <section aria-label="Observações">
        <ul className="flex flex-col gap-3">
          {insights.map((insight) => {
            const Icon = INSIGHT_ICON[insight.icon];
            return (
              <li key={insight.key} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft"
                >
                  <Icon className="size-4" />
                </span>
                <p className="pt-1 text-callout text-fg-2">{insight.text}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </Card>
  );
}

export function YearTableCard({ view }: { view: SimulationView }) {
  const [open, setOpen] = useState(false);
  if (view.years.length === 0) return null;
  return (
    <Card className="flex flex-col py-2">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="simulador-ano-a-ano"
          onClick={() => setOpen((value) => !value)}
          className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-chip px-2 text-left transition-colors duration-100 hover:bg-surface-2/60"
        >
          <span className="text-headline text-fg">Ver ano a ano</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-5 shrink-0 text-fg-3 transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        </button>
      </h2>
      <div id="simulador-ano-a-ano" hidden={!open}>
        <DataTable
          caption="Evolução ano a ano: aportado, juros no período e saldo"
          maxHeightClassName="max-h-96"
          className="mt-1 mb-2"
          columns={[
            { key: "term", header: "Prazo", align: "start" },
            { key: "invested", header: "Aportado", align: "end" },
            { key: "interest", header: "Juros no ano", align: "end" },
            { key: "balance", header: "Saldo", align: "end" },
          ]}
          rows={view.years.map((row) => ({
            key: String(row.month),
            header: row.label,
            cells: [
              wholeReais(row.investedCents),
              wholeReais(row.interestInPeriodCents),
              wholeReais(row.balanceCents),
            ],
            strongLast: true,
          }))}
        />
      </div>
    </Card>
  );
}

/** Compact bar under the collapsed header while the hero is scrolled away (doc 02 §6.11 "Resumo fixo"). */
export function StickySummary({
  visible,
  label,
  summary,
}: {
  visible: boolean;
  label: string;
  summary: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "fixed inset-x-0 top-[calc(3.25rem+env(safe-area-inset-top))] z-10 border-b border-border bg-bar backdrop-blur-lg lg:hidden",
        "transition-[opacity,translate,visibility] duration-150 ease-standard",
        visible
          ? "visible translate-y-0 opacity-100"
          : "invisible -translate-y-1 opacity-0",
      )}
    >
      <div className="mx-auto flex h-11 max-w-300 items-center justify-between gap-3 px-gutter">
        <span className="truncate text-caption text-fg-3">{label}</span>
        <span className="shrink-0 text-headline text-fg tabular-nums">
          {summary}
        </span>
      </div>
    </div>
  );
}
