import { type Change, compareAmounts } from "./comparison";
import { assertInteger } from "./guards";
import { assertCents } from "./money";

/** Gasto fora do padrão (doc 03 §12): not before this day of the period. */
export const UNUSUAL_SPENDING_MIN_DAYS = 7;
/** …nor when the average of the previous periods is below R$ 50,00. */
export const UNUSUAL_SPENDING_MIN_AVERAGE_CENTS = 5_000;
/** At least 40% over the average… */
export const UNUSUAL_SPENDING_MIN_RATIO = 0.4;
/** …and at least R$ 100,00 over it. */
export const UNUSUAL_SPENDING_MIN_DIFF_CENTS = 10_000;

/** A category's spending up to today against the average of the same days before. */
export type CategoryTrend = Omit<Change, "ratio"> & {
  /** diff / average; the average is never 0 (every window had spending). */
  ratio: number;
  /** Average of the previous windows, rounded to the cent (= baselineCents). */
  averageCents: number;
};

/**
 * Compares `currentCents` with the average of `historyCents` (the same
 * stretch of each previous period, doc 03 §12), rounded to the cent. Null
 * when there is no history or any previous window had no spending (no
 * pattern to compare with). Throws RangeError unless every amount is integer
 * cents and `currentCents` >= 0.
 */
export function categoryTrend(
  currentCents: number,
  historyCents: readonly number[],
): CategoryTrend | null {
  historyCents.forEach((value, index) => {
    assertCents(value, `historyCents[${index}]`);
  });
  if (historyCents.length === 0) return null;
  if (historyCents.some((value) => value <= 0)) {
    compareAmounts(currentCents, 0);
    return null;
  }
  const total = historyCents.reduce((sum, value) => sum + value, 0);
  // Each window has at least 1 cent, so the average rounds to >= 1.
  const averageCents = Math.round(total / historyCents.length);
  const change = compareAmounts(currentCents, averageCents);
  return { ...change, ratio: change.ratio ?? 0, averageCents };
}

/** The three value rules of "gasto fora do padrão" (doc 03 §12). */
export function isUnusualSpending(trend: CategoryTrend): boolean {
  return (
    trend.averageCents >= UNUSUAL_SPENDING_MIN_AVERAGE_CENTS &&
    trend.ratio >= UNUSUAL_SPENDING_MIN_RATIO &&
    trend.diffCents >= UNUSUAL_SPENDING_MIN_DIFF_CENTS
  );
}

/**
 * The categories spending well over their pattern (doc 03 §12): none before
 * day `UNUSUAL_SPENDING_MIN_DAYS` of the period; otherwise every row whose
 * trend passes `isUnusualSpending`, ordered by diff descending, then ratio
 * descending, then key ascending, so the order does not depend on the input.
 * Throws RangeError for a non-integer or negative `elapsedDays` or an
 * invalid amount.
 */
export function findUnusualSpending<K extends string>(
  rows: readonly {
    key: K;
    currentCents: number;
    historyCents: readonly number[];
  }[],
  elapsedDays: number,
): (CategoryTrend & { key: K })[] {
  assertInteger(elapsedDays, "elapsedDays", 0);
  if (elapsedDays < UNUSUAL_SPENDING_MIN_DAYS) return [];
  const found: (CategoryTrend & { key: K })[] = [];
  for (const row of rows) {
    const trend = categoryTrend(row.currentCents, row.historyCents);
    if (trend && isUnusualSpending(trend))
      found.push({ ...trend, key: row.key });
  }
  return found.sort(
    (a, b) =>
      b.diffCents - a.diffCents ||
      b.ratio - a.ratio ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}
