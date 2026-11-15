"use client";

import { motion, useReducedMotion } from "motion/react";
import { heatFill, heatTextClass } from "@/components/charts/heat-scale";
import { cn } from "@/lib/utils";
import type { RecapDayCell } from "./model";
import {
  EASE_ENTER,
  RECAP_CONTENT_DELAY_MS,
  RECAP_GROW_MS,
  RECAP_POP_MS,
  RECAP_REVEAL_MS,
  RECAP_RING_MS,
  RECAP_STAGGER_MS,
  RECAP_WEEK_RISE_PX,
  weekEnd,
} from "./motion";

/**
 * Charts of the Retrospectiva (doc 02 §6.12): bars that grow, a ring that
 * closes and a heat strip of the days. Drawn with divs and SVG, decorative:
 * the part's sentences carry the same figures. With reduced motion they
 * appear already complete.
 */

/** A horizontal bar that grows from the left to `share` (0…1) of its track. */
export function RecapBar({
  share,
  color,
  height = 16,
  delay = 0,
  className,
}: {
  share: number;
  /** A CSS color, a chart token. */
  color: string;
  height?: number;
  /** Seconds before it starts growing. */
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const width = share > 0 ? Math.max(2, Math.min(100, share * 100)) : 0;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "w-full overflow-hidden rounded-chip bg-surface-3",
        className,
      )}
      style={{ height }}
    >
      <motion.div
        className="h-full origin-left rounded-chip"
        style={{ width: `${width}%`, background: color }}
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{
          duration: RECAP_GROW_MS / 1000,
          ease: EASE_ENTER,
          delay,
        }}
      />
    </div>
  );
}

/** A ring that closes up to `value` (0…1), the label inside it. */
export function RecapRing({
  value,
  size = 132,
  stroke = 12,
  delay = 0,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  delay?: number;
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const radius = (size - stroke) / 2;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: clamped }}
          transition={{
            duration: RECAP_RING_MS / 1000,
            ease: EASE_ENTER,
            delay,
          }}
        />
      </svg>
      {children ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}

const WEEKDAY_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

/**
 * The month as a calendar of heat: one cell per day in the Calendário's own
 * scale, the biggest day ringed. Weeks come in one after the other. Not
 * interactive and hidden from screen readers; the sentences speak for it.
 */
export function RecapDayStrip({ weeks }: { weeks: (RecapDayCell | null)[][] }) {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden="true" className="flex w-full flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_INITIALS.map((letter, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed seven weekdays
          <span key={index} className="text-center text-micro text-fg-3">
            {letter}
          </span>
        ))}
      </div>
      {weeks.map((week, weekIndex) => (
        <motion.div
          // biome-ignore lint/suspicious/noArrayIndexKey: weeks never reorder
          key={weekIndex}
          className="grid grid-cols-7 gap-1.5"
          initial={reduce ? false : { opacity: 0, y: RECAP_WEEK_RISE_PX }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: RECAP_REVEAL_MS / 1000,
            ease: EASE_ENTER,
            delay:
              (RECAP_CONTENT_DELAY_MS +
                Math.min(weekIndex, 5) * RECAP_STAGGER_MS) /
              1000,
          }}
        >
          {week.map((cell, cellIndex) =>
            cell ? (
              <motion.span
                key={cell.date}
                initial={reduce || !cell.top ? false : { scale: 1 }}
                animate={
                  cell.top && !reduce ? { scale: [1, 1.2, 1] } : undefined
                }
                transition={{
                  duration: RECAP_POP_MS / 1000,
                  ease: EASE_ENTER,
                  delay: weekEnd(weeks.length, weeks.length),
                }}
                className={cn(
                  "flex aspect-square max-h-11 items-center justify-center rounded-lg text-micro tabular-nums",
                  cell.level === 0 && "border border-border",
                  heatTextClass(cell.level),
                  cell.top && "ring-2 ring-fg ring-offset-1 ring-offset-bg",
                )}
                style={{ background: heatFill(cell.level) ?? undefined }}
              >
                {cell.day}
              </motion.span>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: padding cells have no id
              <span key={`pad-${cellIndex}`} className="aspect-square" />
            ),
          )}
        </motion.div>
      ))}
    </div>
  );
}
