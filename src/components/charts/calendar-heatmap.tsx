"use client";

import { type KeyboardEvent, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { HEAT_STEPS, heatFill, heatTextClass } from "./heat-scale";

export type HeatmapDay = {
  /** `YYYY-MM-DD`; the days are consecutive. */
  date: string;
  /** Visible label inside the cell ("14", or "1 nov" where a month starts). */
  label: string;
  /** 0 = nothing, 1…5 (see `heatLevels`). */
  level: number;
  /** Accessible name ("14 de outubro: R$ 230,40 em 3 despesas"). */
  description: string;
  /** After today: hatched, never filled. */
  future?: boolean;
  today?: boolean;
  /** A small dot: something is scheduled that day. */
  marked?: boolean;
};

type CalendarHeatmapProps = {
  days: readonly HeatmapDay[];
  /** Selected date, shown with a ring around the cell. */
  selected: string | null;
  onSelect: (date: string) => void;
  /** Name of the table, read by screen readers. */
  caption: string;
  className?: string;
};

/** Brazilian weeks start on Sunday (doc 02 §5.19). */
const WEEKDAYS = [
  { short: "dom", long: "domingo" },
  { short: "seg", long: "segunda-feira" },
  { short: "ter", long: "terça-feira" },
  { short: "qua", long: "quarta-feira" },
  { short: "qui", long: "quinta-feira" },
  { short: "sex", long: "sexta-feira" },
  { short: "sáb", long: "sábado" },
] as const;

/** 0 = Sunday … 6 = Saturday, from the date alone (no time zone involved). */
function weekdayOf(date: string): number {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Spending calendar (doc 02 §6.12, §9.1): one month as a table of weeks
 * (dom … sáb), each day a button filled with one hue in five steps; a day
 * without spending is outlined, days to come are hatched. Arrow keys move
 * between days (up and down by a week), Home/End go to the ends of the week;
 * Enter or a tap selects. Only one day is in the tab order at a time.
 */
export function CalendarHeatmap({
  days,
  selected,
  onSelect,
  caption,
  className,
}: CalendarHeatmapProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const fallback =
    days.find((day) => day.date === selected)?.date ??
    days.find((day) => day.today)?.date ??
    days[0]?.date ??
    null;
  const [focused, setFocused] = useState<string | null>(null);
  const tabStop =
    focused !== null && days.some((day) => day.date === focused)
      ? focused
      : fallback;

  const lead = days[0] ? weekdayOf(days[0].date) : 0;
  const cells: (HeatmapDay | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, week) =>
    cells.slice(week * 7, week * 7 + 7),
  );

  function moveTo(index: number) {
    const day = days[Math.min(Math.max(index, 0), days.length - 1)];
    if (!day) return;
    setFocused(day.date);
    buttons.current.get(day.date)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    const column = (lead + current) % 7;
    switch (event.key) {
      case "ArrowRight":
        moveTo(current + 1);
        break;
      case "ArrowLeft":
        moveTo(current - 1);
        break;
      case "ArrowDown":
        moveTo(Math.min(current + 7, days.length - 1));
        break;
      case "ArrowUp":
        moveTo(Math.max(current - 7, 0));
        break;
      case "Home":
        moveTo(current - column);
        break;
      case "End":
        moveTo(current + (6 - column));
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  const indexOf = new Map(days.map((day, index) => [day.date, index]));

  return (
    <table
      className={cn(
        "w-full table-fixed border-separate border-spacing-1",
        className,
      )}
    >
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {WEEKDAYS.map((weekday) => (
            <th
              key={weekday.short}
              scope="col"
              abbr={weekday.long}
              className="pb-0.5 text-center text-micro font-semibold text-fg-3"
            >
              {weekday.short}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, row) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: weeks are positional
          <tr key={row}>
            {week.map((day, column) =>
              day ? (
                <td key={day.date} className="p-0">
                  <DayCell
                    day={day}
                    selected={day.date === selected}
                    tabbable={day.date === tabStop}
                    onSelect={onSelect}
                    onFocus={() => setFocused(day.date)}
                    onKeyDown={(event) =>
                      onKeyDown(event, indexOf.get(day.date) ?? 0)
                    }
                    register={(node) => {
                      if (node) buttons.current.set(day.date, node);
                      else buttons.current.delete(day.date);
                    }}
                  />
                </td>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: padding cells are positional
                <td key={`pad-${column}`} className="p-0" />
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DayCell({
  day,
  selected,
  tabbable,
  onSelect,
  onFocus,
  onKeyDown,
  register,
}: {
  day: HeatmapDay;
  selected: boolean;
  tabbable: boolean;
  onSelect: (date: string) => void;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  register: (node: HTMLButtonElement | null) => void;
}) {
  const fill = day.future ? null : heatFill(day.level);
  return (
    <button
      ref={register}
      type="button"
      tabIndex={tabbable ? 0 : -1}
      aria-label={day.description}
      aria-pressed={selected}
      aria-current={day.today ? "date" : undefined}
      onClick={() => onSelect(day.date)}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      style={fill ? { backgroundColor: fill } : undefined}
      className={cn(
        "relative flex h-12 w-full flex-col items-start justify-between overflow-hidden rounded-chip px-1.5 pt-1 pb-1 text-left sm:h-14",
        "transition-[scale,box-shadow] duration-100 ease-standard active:scale-95 focus-visible:z-20",
        fill
          ? heatTextClass(day.level)
          : "border border-border text-fg-3 hover:bg-surface-2/60",
        // Today is outlined (outside the fill, ≥ 3:1 on the surface); the
        // selected day gets the stronger ring, set apart by a surface gap.
        day.today && "ring-2 ring-border-strong",
        selected && "z-10 ring-2 ring-fg ring-offset-2 ring-offset-surface",
      )}
    >
      {day.future ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-hatch text-border-strong/25"
        />
      ) : null}
      <span
        aria-hidden="true"
        className={cn(
          "relative text-micro tabular-nums",
          day.today ? "font-bold" : "font-semibold",
        )}
      >
        {day.label}
      </span>
      {day.today ? (
        <span aria-hidden="true" className="relative text-micro font-bold">
          hoje
        </span>
      ) : day.marked ? (
        <span
          aria-hidden="true"
          className="relative mb-0.5 size-1.5 self-center rounded-full bg-fg-2"
        />
      ) : null}
    </button>
  );
}

/** "menos ▢▢▢▢▢ mais", plus the keys for an empty day and days to come. */
export function HeatmapLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-micro text-fg-3",
        className,
      )}
    >
      <p className="flex items-center gap-1.5">
        <span>menos</span>
        <span aria-hidden="true" className="flex gap-0.5">
          {Array.from({ length: HEAT_STEPS }, (_, step) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: steps are positional
              key={step}
              className="size-3 rounded-[3px]"
              style={{ backgroundColor: heatFill(step + 1) ?? undefined }}
            />
          ))}
        </span>
        <span className="sr-only">
          : quanto mais forte a cor, maior o gasto;
        </span>
        <span>mais</span>
      </p>
      <p className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="size-3 rounded-[3px] border border-border"
          />
          sem gastos
        </span>
        <span className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="size-3 rounded-[3px] border border-border bg-hatch text-border-strong/40"
          />
          a vir
        </span>
      </p>
    </div>
  );
}
