"use client";

import { type CSSProperties, type PointerEvent, useRef } from "react";
import { axisMoneyLabel } from "@/components/charts/format";
import { Masked } from "@/components/charts/masked";
import {
  labelAnchor,
  linePath,
  nearestIndex,
  type Point,
  type Ticks,
  topPercent,
  VIEWBOX,
} from "@/components/charts/scale";
import { formatCompactBRL } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import type { GoalChartModel } from "./detail-model";

/** The projection is the goal's single series (doc 02 §3.3, §6.10). */
export const PROJECTION_COLOR = "var(--primary)";
/** Ink of the target line: dashed here means "alvo" (doc 02 §6.10, §9.2). */
const TARGET_COLOR = "var(--text-3)";

/** A dashed rule drawn with a gradient: 6px dash, 4px gap at any width. */
export function dashStyle(dash = 6, gap = 4): CSSProperties {
  return {
    backgroundImage: `linear-gradient(to right, ${TARGET_COLOR} 0 ${dash}px, transparent ${dash}px ${dash + gap}px)`,
    backgroundSize: `${dash + gap}px 100%`,
  };
}

const ANCHOR_SHIFT = { start: "0%", middle: "-50%", end: "-100%" } as const;

type GoalProjectionChartProps = {
  model: GoalChartModel;
  ticks: Ticks;
  /** Index into `model.points`. */
  selected: number;
  onSelectedChange: (index: number) => void;
  /** Accessible name of the scrub control. */
  scrubLabel: string;
  /** Spoken description of a point ("maio de 2026: aportes de …"). */
  valueText: (index: number) => string;
  /** Labels under the plot, at 0–1 positions along the x axis. */
  xLabels: readonly { position: number; label: string }[];
  plotClassName?: string;
  className?: string;
};

/**
 * Goal projection (doc 02 §6.10): the projected balance as a 2px --primary
 * line from today, the target as a dashed horizontal rule, past contributions
 * as ringed dots and the deadline as a tick on the target. Solid hairline grid
 * with masked ticks in a gutter on the right (doc 02 §9.2). A transparent range
 * input over the plot scrubs it: drag, tap, arrow keys and screen readers all
 * move the selection, whose values the caller shows above.
 */
export function GoalProjectionChart({
  model,
  ticks,
  selected,
  onSelectedChange,
  scrubLabel,
  valueText,
  xLabels,
  plotClassName = "h-44",
  className,
}: GoalProjectionChartProps) {
  const dragging = useRef(false);
  const span = Math.max(1, model.span);
  const count = model.points.length;
  const index = Math.min(Math.max(selected, 0), count - 1);
  const xPercent = (offset: number) => (offset / span) * 100;
  const yPercent = (cents: number) => topPercent(cents, ticks);

  const line: Point[] = model.points
    .filter((point) => point.kind !== "history")
    .map((point) => [
      (xPercent(point.offset) / 100) * VIEWBOX,
      (yPercent(point.balanceCents) / 100) * VIEWBOX,
    ]);
  const positions = model.points.map((point) => point.offset / span);
  const current = model.points[index];
  const today = model.points[model.todayIndex];
  const end = model.points.at(-1);
  const targetY = yPercent(model.targetCents);
  const deadlineX =
    model.deadlineOffset === null ? null : xPercent(model.deadlineOffset);

  function selectFromPointer(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    onSelectedChange(nearestIndex(ratio, positions));
  }

  return (
    <div className={cn("relative pt-5", className)}>
      <div className={cn("relative", plotClassName)}>
        {ticks.values.map((value) => (
          <div
            key={value}
            aria-hidden="true"
            className={cn(
              "absolute inset-x-0 border-t",
              value === 0 ? "border-chart-axis" : "border-chart-grid",
            )}
            style={{ top: `${yPercent(value)}%` }}
          >
            <span className="absolute right-0 bottom-0.5 text-micro text-fg-3 tabular-nums">
              <Masked>{axisMoneyLabel(value)}</Masked>
            </span>
          </div>
        ))}

        {/* The data stops short of the tick labels on the right. */}
        <div className="absolute inset-y-0 right-11 left-0">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 h-0.5 -translate-y-1/2"
            style={{ top: `${targetY}%`, ...dashStyle() }}
          />
          <span
            aria-hidden="true"
            className="absolute left-0 whitespace-nowrap rounded-badge bg-surface/85 px-1 text-micro font-bold text-fg-2"
            style={{
              top: `${targetY}%`,
              transform: "translateY(calc(-100% - 4px))",
            }}
          >
            Meta{" "}
            <Masked mask="R$ ••••">
              {formatCompactBRL(model.targetCents)}
            </Masked>
          </span>

          {deadlineX === null ? null : (
            <>
              <span
                aria-hidden="true"
                className="absolute h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-3"
                style={{ left: `${deadlineX}%`, top: `${targetY}%` }}
              />
              <span
                aria-hidden="true"
                className="absolute whitespace-nowrap rounded-badge bg-surface/85 px-1 text-micro font-semibold text-fg-3"
                style={{
                  left: `${deadlineX}%`,
                  top: `${targetY}%`,
                  transform: `translate(${ANCHOR_SHIFT[labelAnchor(deadlineX)]}, 8px)`,
                }}
              >
                prazo
              </span>
            </>
          )}

          <svg
            aria-hidden="true"
            viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            <path
              d={linePath(line)}
              fill="none"
              style={{ stroke: PROJECTION_COLOR }}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div
            aria-hidden="true"
            className="absolute inset-y-0 w-px -translate-x-1/2 bg-border-strong/60"
            style={{ left: `${xPercent(current?.offset ?? 0)}%` }}
          />

          {model.points.map((point, pointIndex) =>
            point.kind === "history" ? (
              <Dot
                // biome-ignore lint/suspicious/noArrayIndexKey: points are positional
                key={pointIndex}
                x={xPercent(point.offset)}
                y={yPercent(point.balanceCents)}
              />
            ) : null,
          )}
          {today ? (
            <Dot
              x={xPercent(today.offset)}
              y={yPercent(today.balanceCents)}
              className="size-2.5"
            />
          ) : null}
          {end && end.kind === "projection" ? (
            <Dot x={xPercent(end.offset)} y={yPercent(end.balanceCents)} />
          ) : null}
          {current ? (
            <Dot
              x={xPercent(current.offset)}
              y={yPercent(current.balanceCents)}
              className="size-3"
            />
          ) : null}

          <input
            type="range"
            min={0}
            max={Math.max(0, count - 1)}
            step={1}
            value={index}
            aria-label={scrubLabel}
            aria-valuetext={valueText(index)}
            onChange={(event) => onSelectedChange(Number(event.target.value))}
            className="peer pointer-events-none absolute inset-0 m-0 size-full appearance-none opacity-0"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1 rounded-chip peer-focus-visible:outline-2 peer-focus-visible:outline-focus"
          />
          {/* Pointer scrub: the range input above handles keys and screen
              readers; this layer follows the finger anywhere on the plot (iOS
              range inputs only move by their thumb) and lets vertical swipes
              scroll the page. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 cursor-ew-resize"
            style={{ touchAction: "pan-y" }}
            onPointerDown={(event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              selectFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (dragging.current || event.pointerType === "mouse") {
                selectFromPointer(event);
              }
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
          />
        </div>
      </div>

      <div aria-hidden="true" className="relative mt-1.5 mr-11 h-4">
        {xLabels.map((item) => {
          const percent = item.position * 100;
          return (
            <span
              key={`${item.position}-${item.label}`}
              className="absolute top-0 whitespace-nowrap text-micro text-fg-3"
              style={{
                left: `${percent}%`,
                transform: `translateX(${ANCHOR_SHIFT[labelAnchor(percent)]})`,
              }}
            >
              {item.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Ringed dot (doc 02 §9.2: ≥ 8px with a 2px ring of the surface). */
function Dot({
  x,
  y,
  className,
}: {
  x: number;
  y: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--dot) ring-2 ring-surface",
        className,
      )}
      style={
        {
          left: `${x}%`,
          top: `${y}%`,
          "--dot": PROJECTION_COLOR,
        } as CSSProperties
      }
    />
  );
}
