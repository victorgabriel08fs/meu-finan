import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type SplitSegment = {
  key: string;
  value: number;
  /** CSS color, e.g. `var(--chart-1)`. */
  color: string;
};

type SplitBarProps = {
  segments: readonly SplitSegment[];
  /** Spoken summary ("Investido R$ 130.000, 51%; juros R$ 122.988, 49%"). */
  summary: string;
  className?: string;
};

/**
 * Part of a whole as one 100% bar (doc 02 §9.1: "investido × juros"): round
 * ends, a 2px surface gap between segments, no text inside the marks.
 */
export function SplitBar({ segments, summary, className }: SplitBarProps) {
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div
      role="img"
      aria-label={summary}
      className={cn("flex h-2.5 w-full gap-0.5", className)}
    >
      {visible.map((segment, index) => (
        <span
          key={segment.key}
          aria-hidden="true"
          className={cn(
            "h-full min-w-1 bg-(--segment)",
            index === 0 && "rounded-l-full",
            index === visible.length - 1 && "rounded-r-full",
          )}
          style={
            {
              width: `${total > 0 ? (segment.value / total) * 100 : 0}%`,
              "--segment": segment.color,
            } as CSSProperties
          }
        />
      ))}
      {visible.length === 0 ? (
        <span
          aria-hidden="true"
          className="h-full w-full rounded-full bg-surface-2"
        />
      ) : null}
    </div>
  );
}
