"use client";

import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useId,
  useRef,
} from "react";
import { cn } from "@/lib/utils";
import {
  areaPath,
  labelAnchor,
  linePath,
  nearestIndex,
  type Point,
  type Ticks,
  topPercent,
  VIEWBOX,
} from "./scale";

export type SeriesSegment = {
  key: string;
  /** One value per x position; `null` leaves the position out. */
  values: readonly (number | null)[];
  /** Projection (doc 02 §9.2: dashes are reserved for projections and targets). */
  dashed?: boolean;
  /** 12% wash between the line and the baseline (a single-series area). */
  area?: boolean;
  /**
   * Value the line departs from at its first point, drawn as a vertical join
   * (a projection that starts at the realized balance of the same day).
   */
  joinFrom?: number | null;
};

export type SeriesMarker = {
  index: number;
  value: number;
  /** Short direct label ("Aluguel"); never a number on every point (§9.3). */
  label: string;
  /** Side of the label; defaults to above the point. */
  placement?: "above" | "below";
};

export type SeriesScrub = {
  /** Selected x position. */
  selected: number;
  onSelectedChange: (index: number) => void;
  /** Accessible name of the scrub control. */
  label: string;
  /** Spoken description of a position ("25 de outubro: saldo previsto …"). */
  valueText: (index: number) => string;
};

type SeriesChartProps = {
  /** Pieces of one series, drawn in order (e.g. realized, then projected). */
  segments: readonly SeriesSegment[];
  /** CSS color; single series use --primary (doc 02 §3.3). */
  color?: string;
  ticks: Ticks;
  formatTick: (value: number) => ReactNode;
  /** Labels under the plot at 0–1 positions. */
  xLabels: readonly { position: number; label: string }[];
  /** At most a few flagged points (hollow ringed dots with a label). */
  markers?: readonly SeriesMarker[];
  /**
   * Scrub (doc 02 §9.4): a transparent range input over the plot — drag, tap,
   * arrow keys and screen readers move the selection, shown by the caller
   * above the chart. Without it the chart is a static image.
   */
  scrub?: SeriesScrub;
  /** A position to mark without a scrub of its own (linked small multiples). */
  highlight?: number | null;
  /** Spoken summary of the whole chart. */
  summary: string;
  /** Height of the plot (the x labels add 22px below it). */
  plotClassName?: string;
  className?: string;
};

const SHIFT = { start: "0%", middle: "-50%", end: "-100%" } as const;

/** Index ranges of consecutive non-null values. */
function runsOf(values: readonly (number | null)[]): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  values.forEach((value, index) => {
    if (value !== null && start === -1) start = index;
    if (value === null && start !== -1) {
      runs.push([start, index - 1]);
      start = -1;
    }
  });
  if (start !== -1) runs.push([start, values.length - 1]);
  return runs;
}

/**
 * Single-series line or area over time (doc 02 §9.2): 2px line, solid
 * hairline grid with the ticks in a gutter on the right (clear of the data),
 * the zero line in the axis color, a dashed segment for what is projected,
 * a few labelled markers and an optional scrub.
 */
export function SeriesChart({
  segments,
  color = "var(--primary)",
  ticks,
  formatTick,
  xLabels,
  markers = [],
  scrub,
  highlight = null,
  summary,
  plotClassName = "h-40",
  className,
}: SeriesChartProps) {
  const summaryId = useId();
  const dragging = useRef(false);
  const count = Math.max(
    0,
    ...segments.map((segment) => segment.values.length),
  );
  const last = Math.max(1, count - 1);
  const single = count === 1;
  const xPercent = (index: number) => (single ? 50 : (index / last) * 100);
  const yPercent = (value: number) => topPercent(value, ticks);
  const toPoint = (index: number, value: number): Point => [
    (xPercent(index) / 100) * VIEWBOX,
    (yPercent(value) / 100) * VIEWBOX,
  ];
  // Areas grow from zero, or from the bottom of an axis that does not reach it.
  const floor = Math.min(Math.max(0, ticks.min), ticks.max);

  const selected = scrub
    ? Math.min(Math.max(scrub.selected, 0), Math.max(0, count - 1))
    : highlight !== null && highlight >= 0 && highlight < count
      ? highlight
      : null;
  const positions = Array.from({ length: count }, (_, index) =>
    single ? 0.5 : index / last,
  );

  function linePoints(segment: SeriesSegment): (Point | null)[] {
    const points = segment.values.map((value, index) =>
      value === null ? null : toPoint(index, value),
    );
    const first = segment.values.findIndex((value) => value !== null);
    if (
      segment.joinFrom === null ||
      segment.joinFrom === undefined ||
      first === -1
    ) {
      return points;
    }
    return [
      ...points.slice(0, first),
      toPoint(first, segment.joinFrom),
      ...points.slice(first),
    ];
  }

  function selectFromPointer(event: PointerEvent<HTMLElement>) {
    if (!scrub) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    scrub.onSelectedChange(nearestIndex(ratio, positions));
  }

  // Static, the chart is an image named by its summary; with a scrub, the
  // range input speaks and the summary describes it.
  const imageProps = scrub
    ? {}
    : { role: "img" as const, "aria-label": summary };

  return (
    <div
      {...imageProps}
      className={cn("relative pt-5", className)}
      style={{ "--line": color } as CSSProperties}
    >
      {scrub ? (
        <p id={summaryId} className="sr-only">
          {summary}
        </p>
      ) : null}
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
              {formatTick(value)}
            </span>
          </div>
        ))}

        {/* The data stops short of the tick labels on the right. */}
        <div className="absolute inset-y-0 right-11 left-0">
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            {segments.map((segment) =>
              segment.area
                ? runsOf(segment.values)
                    .filter(([start, end]) => end > start)
                    .map(([start, end]) => {
                      const indices = Array.from(
                        { length: end - start + 1 },
                        (_, k) => start + k,
                      );
                      return (
                        <path
                          key={`${segment.key}-area-${start}`}
                          d={areaPath(
                            indices.map((index) =>
                              toPoint(index, segment.values[index] ?? floor),
                            ),
                            indices.map((index) => toPoint(index, floor)),
                          )}
                          style={{ fill: "var(--line)" }}
                          fillOpacity={segment.dashed ? 0.06 : 0.12}
                        />
                      );
                    })
                : null,
            )}
            {segments.map((segment) => (
              <path
                key={`${segment.key}-line`}
                d={linePath(linePoints(segment))}
                fill="none"
                style={{ stroke: "var(--line)" }}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap={segment.dashed ? "butt" : "round"}
                strokeDasharray={segment.dashed ? "5 4" : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {selected === null ? null : (
            <>
              <div
                aria-hidden="true"
                className="absolute inset-y-0 w-px -translate-x-1/2 bg-border-strong/60"
                style={{ left: `${xPercent(selected)}%` }}
              />
              {segments.map((segment) => {
                const value = segment.values[selected];
                if (value === null || value === undefined) return null;
                return (
                  <span
                    key={`${segment.key}-dot`}
                    aria-hidden="true"
                    className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--line) ring-2 ring-surface"
                    style={{
                      left: `${xPercent(selected)}%`,
                      top: `${yPercent(value)}%`,
                    }}
                  />
                );
              })}
            </>
          )}

          {markers.map((marker) => {
            const x = xPercent(marker.index);
            const y = yPercent(marker.value);
            const below = marker.placement === "below";
            return (
              <span key={`${marker.index}-${marker.label}`} aria-hidden="true">
                <span
                  className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-(--line) bg-surface"
                  style={{ left: `${x}%`, top: `${y}%` }}
                />
                <span
                  className="absolute whitespace-nowrap rounded-badge bg-surface/85 px-1 text-micro font-bold text-fg"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: `translate(${SHIFT[labelAnchor(x)]}, ${below ? "8px" : "calc(-100% - 8px)"})`,
                  }}
                >
                  {marker.label}
                </span>
              </span>
            );
          })}

          {scrub ? (
            <>
              <input
                type="range"
                min={0}
                max={Math.max(0, count - 1)}
                step={1}
                value={selected ?? 0}
                aria-label={scrub.label}
                aria-valuetext={scrub.valueText(selected ?? 0)}
                aria-describedby={summaryId}
                onChange={(event) =>
                  scrub.onSelectedChange(Number(event.target.value))
                }
                className="peer pointer-events-none absolute inset-0 m-0 size-full appearance-none opacity-0"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-1 rounded-chip peer-focus-visible:outline-2 peer-focus-visible:outline-focus"
              />
              {/* Pointer scrub: the range input handles keys and screen
                  readers; this layer follows the finger anywhere on the plot
                  and lets vertical swipes scroll the page. */}
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
            </>
          ) : null}
        </div>
      </div>

      <div aria-hidden="true" className="relative mt-1.5 mr-11 h-4">
        {xLabels.map((item) => {
          const percent = single ? 50 : item.position * 100;
          return (
            <span
              key={`${item.position}-${item.label}`}
              className="absolute top-0 whitespace-nowrap text-micro text-fg-3"
              style={{
                left: `${percent}%`,
                transform: `translateX(${SHIFT[labelAnchor(percent)]})`,
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
