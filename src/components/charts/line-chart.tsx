import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  labelAnchor,
  linePath,
  type Point,
  type Ticks,
  topPercent,
  VIEWBOX,
} from "./scale";

type LineChartProps = {
  /** One value per x position; `null` leaves a gap. */
  values: readonly (number | null)[];
  ticks: Ticks;
  formatTick: (value: number) => ReactNode;
  /** Direct labels for a few points only (peak, low, last — doc 02 §9.3). */
  labels: readonly { index: number; text: ReactNode }[];
  /** Labels under the plot at 0–1 positions. */
  xLabels: readonly { position: number; label: string }[];
  /** Summary read by screen readers (the chart is an image). */
  summary: string;
  /** CSS color; single series use --primary (doc 02 §3.3). */
  color?: string;
  plotClassName?: string;
  className?: string;
};

const SHIFT = { start: "0%", middle: "-50%", end: "-100%" } as const;

/**
 * Single-series line (doc 02 §9.2): 2px line, solid hairline grid with its
 * ticks in a gutter on the right, a zero baseline in the axis color,
 * selective direct labels with ringed dots.
 * Static: renders on the server.
 */
export function LineChart({
  values,
  ticks,
  formatTick,
  labels,
  xLabels,
  summary,
  color = "var(--primary)",
  plotClassName = "h-24",
  className,
}: LineChartProps) {
  const last = Math.max(1, values.length - 1);
  const single = values.length === 1;
  const xPercent = (index: number) => (single ? 50 : (index / last) * 100);
  const yPercent = (value: number) => topPercent(value, ticks);
  const points: (Point | null)[] = values.map((value, index) =>
    value === null
      ? null
      : [(xPercent(index) / 100) * VIEWBOX, (yPercent(value) / 100) * VIEWBOX],
  );

  return (
    <div
      role="img"
      aria-label={summary}
      className={cn("relative pt-5", className)}
      style={{ "--line": color } as CSSProperties}
    >
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
            <path
              d={linePath(points)}
              fill="none"
              style={{ stroke: "var(--line)" }}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {labels.map(({ index, text }) => {
            const value = values[index];
            if (value === null || value === undefined) return null;
            const x = xPercent(index);
            const y = yPercent(value);
            const below = y < 30;
            return (
              <span key={index} aria-hidden="true">
                <span
                  className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--line) ring-2 ring-surface"
                  style={{ left: `${x}%`, top: `${y}%` }}
                />
                <span
                  className="absolute whitespace-nowrap rounded-badge bg-surface/85 px-1 text-micro font-bold text-fg tabular-nums"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: `translate(${SHIFT[labelAnchor(x)]}, ${below ? "8px" : "calc(-100% - 8px)"})`,
                  }}
                >
                  {text}
                </span>
              </span>
            );
          })}
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
