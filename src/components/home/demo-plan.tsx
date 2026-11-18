"use client";

import { m } from "motion/react";
import { formatBRL } from "@/lib/format/money";
import { DemoCard, DemoLabel } from "./home-section";
import { curvePath, DEMO } from "./model";
import { HOME_GROW_MS, HOME_REVEAL_MS } from "./motion";
import { entranceTransition, useEntrance } from "./use-entrance";

const RING = 56;
const RING_STROKE = 7;
const CHART_W = 256;
const CHART_H = 64;
const CURVE_MAX = DEMO.curve[DEMO.curve.length - 1];
const CURVE = curvePath(DEMO.curve, CHART_W, CHART_H, CURVE_MAX);
const DEPOSITS = curvePath(DEMO.deposits, CHART_W, CHART_H, CURVE_MAX);
const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * Section 4: a budget bar that fills to 80% and then shows its label, a goal
 * ring that closes to 62% and the simulator's curve drawn from left to right
 * (800ms each). At rest: bar, ring and curve in their final state.
 */
export function DemoPlan() {
  const { ref, entrance } = useEntrance<HTMLDivElement>();
  const armed = entrance === "armed";
  const grow = entranceTransition(entrance, HOME_GROW_MS);
  const after = entranceTransition(
    entrance,
    HOME_REVEAL_MS,
    HOME_GROW_MS / 2000,
  );

  return (
    <div ref={ref}>
      <DemoCard className="gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-headline text-fg">{DEMO.budget.name}</span>
            <m.span
              initial={false}
              animate={{ opacity: armed ? 0 : 1 }}
              transition={after}
              className="text-callout font-semibold tabular-nums text-fg"
            >
              {percent(DEMO.budgetShare)}
            </m.span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <m.div
              initial={false}
              animate={{ scaleX: armed ? 0 : 1 }}
              transition={grow}
              className="h-full origin-left rounded-full bg-warning-fill"
              style={{ width: percent(DEMO.budgetShare) }}
            />
          </div>
          <p className="text-caption tabular-nums text-fg-2">
            {formatBRL(DEMO.budget.spent)} de {formatBRL(DEMO.budget.limit)}
          </p>
        </div>

        <div className="flex items-center gap-4 border-t border-border pt-5">
          <div
            className="relative inline-flex shrink-0 items-center justify-center"
            style={{ width: RING, height: RING }}
          >
            <svg
              aria-hidden="true"
              width={RING}
              height={RING}
              viewBox={`0 0 ${RING} ${RING}`}
              className="absolute inset-0 -rotate-90"
            >
              <circle
                cx={RING / 2}
                cy={RING / 2}
                r={(RING - RING_STROKE) / 2}
                fill="none"
                strokeWidth={RING_STROKE}
                className="stroke-surface-2"
              />
              <m.circle
                cx={RING / 2}
                cy={RING / 2}
                r={(RING - RING_STROKE) / 2}
                fill="none"
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                className="stroke-primary"
                initial={false}
                animate={{ pathLength: armed ? 0 : DEMO.goalShare }}
                transition={grow}
              />
            </svg>
            <span className="relative text-caption font-bold tabular-nums text-fg">
              {percent(DEMO.goalShare)}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-headline text-fg">{DEMO.goal.name}</span>
            <span className="text-caption tabular-nums text-fg-2">
              {formatBRL(DEMO.goal.saved)} de {formatBRL(DEMO.goal.target)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <DemoLabel>Em 10 anos</DemoLabel>
            <m.span
              initial={false}
              animate={{ opacity: armed ? 0 : 1 }}
              transition={after}
              className="text-headline tabular-nums text-fg"
            >
              {formatBRL(CURVE_MAX)}
            </m.span>
          </div>
          <svg
            aria-hidden="true"
            viewBox={`-2 -4 ${CHART_W + 4} ${CHART_H + 8}`}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-auto w-full"
          >
            <path
              d={DEPOSITS}
              strokeWidth={1.5}
              strokeDasharray="1 5"
              className="stroke-border-strong"
            />
            <m.path
              d={CURVE}
              strokeWidth={2.5}
              className="stroke-primary"
              initial={false}
              animate={{ pathLength: armed ? 0 : 1 }}
              transition={grow}
            />
          </svg>
        </div>
      </DemoCard>
    </div>
  );
}
