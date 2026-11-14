import {
  addDays,
  assertDate,
  compare,
  daysBetween,
  type LocalDate,
  minDate,
} from "./dates";
import { assertInteger } from "./guards";
import { assertCents } from "./money";

/** A stretch of days, both ends included. */
export type DateWindow = { start: LocalDate; end: LocalDate };

export type Change = {
  /** Magnitude of the stretch being looked at (>= 0). */
  currentCents: number;
  /** Magnitude it is compared with (>= 0). */
  baselineCents: number;
  /** current − baseline. */
  diffCents: number;
  /** diff / baseline; null when baseline = 0 (nothing to compare with). */
  ratio: number | null;
  direction: "up" | "down" | "same";
};

export type KeyedChange<K extends string = string> = Change & { key: K };

function assertMagnitude(value: number, label: string): void {
  assertCents(value, label);
  if (value < 0) {
    throw new RangeError(`${label} must not be negative (received ${value})`);
  }
}

/**
 * Change from `baselineCents` to `currentCents` (doc 03 §12). Amounts are
 * magnitudes: throws RangeError unless both are integer cents >= 0.
 */
export function compareAmounts(
  currentCents: number,
  baselineCents: number,
): Change {
  assertMagnitude(currentCents, "currentCents");
  assertMagnitude(baselineCents, "baselineCents");
  const diffCents = currentCents - baselineCents;
  return {
    currentCents,
    baselineCents,
    diffCents,
    ratio: baselineCents === 0 ? null : diffCents / baselineCents,
    direction: diffCents > 0 ? "up" : diffCents < 0 ? "down" : "same",
  };
}

export type BreakdownComparison<K extends string = string> = {
  /** Over every key, before `limit` and `minAbsDiffCents`. */
  total: Change;
  items: KeyedChange<K>[];
};

/**
 * Compares two breakdowns (category → cents). A key missing on one side is
 * 0 there; a key with 0 on both sides is left out. Items are ordered by
 * |diff| descending, then current descending, then key ascending, so the
 * order is deterministic. `minAbsDiffCents` (default 0) and `limit` (default
 * none) only filter `items`; `total` always covers every key.
 */
export function compareBreakdown<K extends string>(
  current: ReadonlyMap<K, number>,
  baseline: ReadonlyMap<K, number>,
  options: { limit?: number; minAbsDiffCents?: number } = {},
): BreakdownComparison<K> {
  const { limit, minAbsDiffCents = 0 } = options;
  if (limit !== undefined) assertInteger(limit, "limit", 0);
  assertMagnitude(minAbsDiffCents, "minAbsDiffCents");

  const keys = new Set<K>([...current.keys(), ...baseline.keys()]);
  const all: KeyedChange<K>[] = [];
  let currentTotal = 0;
  let baselineTotal = 0;
  for (const key of keys) {
    const change = compareAmounts(
      current.get(key) ?? 0,
      baseline.get(key) ?? 0,
    );
    currentTotal += change.currentCents;
    baselineTotal += change.baselineCents;
    if (change.currentCents === 0 && change.baselineCents === 0) continue;
    all.push({ ...change, key });
  }
  all.sort(
    (a, b) =>
      Math.abs(b.diffCents) - Math.abs(a.diffCents) ||
      b.currentCents - a.currentCents ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const items = all.filter(
    (item) => Math.abs(item.diffCents) >= minAbsDiffCents,
  );
  return {
    total: compareAmounts(currentTotal, baselineTotal),
    items: limit === undefined ? items : items.slice(0, limit),
  };
}

function assertWindow(window: DateWindow, label: string): void {
  assertDate(window.start, `${label}.start`);
  assertDate(window.end, `${label}.end`);
  if (compare(window.end, window.start) < 0) {
    throw new RangeError(`${label} must not end before it starts`);
  }
}

export type ComparisonWindows = {
  current: DateWindow;
  previous: DateWindow[];
  /** Days of `period` up to today (E), or all of it when complete. */
  elapsedDays: number;
  /** Today is on or after the period's last day: whole periods are compared. */
  complete: boolean;
};

/**
 * "Up to the same point" windows (doc 03 §12): days 1..E of `period`, where
 * E counts today, against days 1..E of each previous period, clamped to that
 * period's end so a shorter month never runs into the next one. From the
 * period's last day on (or for a past period), whole periods are compared.
 * Null when today is before the period starts. Throws RangeError for a
 * period that ends before it starts.
 */
export function comparisonWindows(
  period: DateWindow,
  previous: readonly DateWindow[],
  today: LocalDate,
): ComparisonWindows | null {
  assertWindow(period, "period");
  previous.forEach((window, index) => {
    assertWindow(window, `previous[${index}]`);
  });
  assertDate(today, "today");
  if (compare(today, period.start) < 0) return null;

  const complete = compare(today, period.end) >= 0;
  if (complete) {
    return {
      current: { start: period.start, end: period.end },
      previous: previous.map((window) => ({
        start: window.start,
        end: window.end,
      })),
      elapsedDays: daysBetween(period.start, period.end) + 1,
      complete,
    };
  }
  const elapsedDays = daysBetween(period.start, today) + 1;
  return {
    current: { start: period.start, end: today },
    previous: previous.map((window) => ({
      start: window.start,
      end: minDate(addDays(window.start, elapsedDays - 1), window.end),
    })),
    elapsedDays,
    complete,
  };
}
