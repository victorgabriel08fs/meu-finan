"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useRef,
} from "react";
import { cn } from "@/lib/utils";
import { type Ticks, topPercent } from "./scale";

export type ColumnSeries = {
  key: string;
  label: string;
  /** CSS color of the series, e.g. `var(--chart-3)`. */
  color: string;
};

export type ColumnGroup = {
  key: string;
  /** Short label under the group ("out"). */
  label: string;
  /** The period is still running: the label gets an asterisk (doc 02 §6.12). */
  partial?: boolean;
  /** One value per series, same order as `series`. */
  values: readonly number[];
};

type GroupedColumnChartProps = {
  series: readonly ColumnSeries[];
  groups: readonly ColumnGroup[];
  /** Selected group; the others drop to 40% (doc 02 §9.4). */
  selected: number | null;
  onSelect: (index: number) => void;
  ticks: Ticks;
  formatTick: (value: number) => ReactNode;
  /** Accessible name of each group's button ("setembro de 2026: receitas …"). */
  describeGroup: (index: number) => string;
  /** Accessible name of the whole chart. */
  label: string;
  plotClassName?: string;
  className?: string;
};

/**
 * Grouped columns (doc 02 §9.1, §9.2): ≤ 24px bars with a 4px rounded top
 * and a square base, a 2px gap inside each group, one value axis. Every
 * group is a button at least 24px wide; tapping selects it, arrow keys move
 * the selection.
 */
export function GroupedColumnChart({
  series,
  groups,
  selected,
  onSelect,
  ticks,
  formatTick,
  describeGroup,
  label,
  plotClassName = "h-40",
  className,
}: GroupedColumnChartProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const focusIndex = selected ?? groups.length - 1;
  const zero = topPercent(0, ticks);

  function move(index: number) {
    const next = Math.min(Math.max(index, 0), groups.length - 1);
    onSelect(next);
    buttons.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowRight":
        move(focusIndex + 1);
        break;
      case "ArrowLeft":
        move(focusIndex - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(groups.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
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
            style={{ top: `${topPercent(value, ticks)}%` }}
          >
            {value === 0 ? null : (
              <span className="absolute right-0 bottom-0.5 text-micro text-fg-3 tabular-nums">
                {formatTick(value)}
              </span>
            )}
          </div>
        ))}

        <div
          role="toolbar"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="absolute inset-x-0 top-0 flex"
          style={{ bottom: `${100 - zero}%` }}
        >
          {groups.map((group, index) => {
            const active = selected === null || selected === index;
            return (
              <button
                key={group.key}
                ref={(node) => {
                  buttons.current[index] = node;
                }}
                type="button"
                aria-pressed={selected === index}
                aria-label={describeGroup(index)}
                tabIndex={index === focusIndex ? 0 : -1}
                onClick={() => onSelect(index)}
                className="flex h-full min-w-6 flex-1 items-end justify-center gap-0.5 rounded-t-chip px-0.5 -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/50"
              >
                {group.values.map((value, seriesIndex) => {
                  const color = series[seriesIndex]?.color ?? "var(--primary)";
                  const height =
                    value > 0
                      ? Math.max(
                          0,
                          100 - topPercent(value, { min: 0, max: ticks.max }),
                        )
                      : 0;
                  return (
                    <span
                      key={series[seriesIndex]?.key ?? seriesIndex}
                      aria-hidden="true"
                      className={cn(
                        "block w-full max-w-6 rounded-t-[4px] bg-(--bar) transition-opacity duration-150",
                        value > 0 && "min-h-0.5",
                        active ? "opacity-100" : "opacity-40",
                      )}
                      style={
                        {
                          height: `${height}%`,
                          "--bar": color,
                        } as CSSProperties
                      }
                    />
                  );
                })}
              </button>
            );
          })}
        </div>
      </div>

      <div aria-hidden="true" className="mt-1.5 flex">
        {groups.map((group, index) => (
          <span
            key={group.key}
            className={cn(
              "min-w-6 flex-1 truncate text-center text-micro",
              selected === index ? "font-bold text-fg" : "text-fg-3",
            )}
          >
            {group.label}
            {group.partial ? "*" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
