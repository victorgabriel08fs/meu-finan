import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { linePath, type Point, VIEWBOX } from "./scale";

type SparklineProps = {
  values: readonly number[];
  /** Summary read by screen readers ("Patrimônio subiu de … para …"). */
  summary: string;
  color?: string;
  className?: string;
};

/**
 * Tiny trend line (doc 02 §9.6): no axes, min–max scaled with a little air,
 * 2px line and a ringed dot on the last point. Static: renders on the server.
 */
export function Sparkline({
  values,
  summary,
  color = "var(--primary)",
  className,
}: SparklineProps) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const last = Math.max(1, values.length - 1);
  // 10% of air above and below; a flat series sits in the middle.
  const yPercent = (value: number) =>
    span === 0 ? 50 : 90 - ((value - min) / span) * 80;
  const xPercent = (index: number) =>
    values.length === 1 ? 100 : (index / last) * 100;
  const points: Point[] = values.map((value, index) => [
    (xPercent(index) / 100) * VIEWBOX,
    (yPercent(value) / 100) * VIEWBOX,
  ]);
  const end = values.at(-1);

  return (
    <div
      role="img"
      aria-label={summary}
      className={cn("relative h-11 w-30", className)}
      style={{ "--line": color } as CSSProperties}
    >
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
      {end === undefined ? null : (
        <span
          aria-hidden="true"
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--line) ring-2 ring-surface"
          style={{
            left: `${xPercent(values.length - 1)}%`,
            top: `${yPercent(end)}%`,
          }}
        />
      )}
    </div>
  );
}
