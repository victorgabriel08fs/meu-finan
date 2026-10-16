import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type LegendShape = "square" | "line" | "hatch" | "empty";

export type LegendEntry = {
  key: string;
  label: ReactNode;
  /** CSS color of the series, e.g. `var(--chart-1)`. */
  color: string;
  /** Mirrors the mark: square for bars and areas, line for lines (doc 02 §9.3). */
  shape?: LegendShape;
  /** Optional value under or after the label (text tokens, never the series color). */
  value?: ReactNode;
};

/** The colored key beside a label; text always stays in text tokens. */
export function LegendSwatch({
  color,
  shape = "square",
  className,
}: {
  color: string;
  shape?: LegendShape;
  className?: string;
}) {
  const style = { "--swatch": color } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        "inline-block shrink-0",
        shape === "line" && "h-0.75 w-3 rounded-full bg-(--swatch)",
        shape === "square" && "size-2.5 rounded-[3px] bg-(--swatch)",
        shape === "hatch" &&
          "size-2.5 rounded-[3px] bg-hatch text-(--swatch) opacity-60",
        shape === "empty" &&
          "size-2.5 rounded-[3px] border border-border-strong/50 bg-surface-2",
        className,
      )}
    />
  );
}

type ChartLegendProps = {
  entries: LegendEntry[];
  /** `inline`: one row of keys · `stacked`: label over a value, in columns. */
  layout?: "inline" | "stacked";
  className?: string;
};

/** Legend above the chart for two or more series (doc 02 §9.3). */
export function ChartLegend({
  entries,
  layout = "inline",
  className,
}: ChartLegendProps) {
  if (layout === "stacked") {
    return (
      <ul
        className={cn(
          "grid gap-2",
          entries.length === 3 ? "grid-cols-3" : "grid-cols-2",
          className,
        )}
      >
        {entries.map((entry) => (
          <li key={entry.key} className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-caption font-semibold text-fg-3">
              <LegendSwatch color={entry.color} shape={entry.shape} />
              <span className="truncate">{entry.label}</span>
            </span>
            {entry.value !== undefined ? (
              <span className="text-headline text-fg">{entry.value}</span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 text-caption font-semibold text-fg-2",
        className,
      )}
    >
      {entries.map((entry) => (
        <li key={entry.key} className="flex items-center gap-1.5">
          <LegendSwatch color={entry.color} shape={entry.shape} />
          <span>{entry.label}</span>
          {entry.value !== undefined ? (
            <span className="text-fg">{entry.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
