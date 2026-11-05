import { assertCents } from "./money";

export type AverageComparison = {
  /** Average of the history entries with spending, rounded to the cent. */
  averageCents: number;
  /** (current − average) / average: −0.18 is 18% below the average. */
  ratio: number;
};

/** History entries with spending needed before comparing. */
export const AVERAGE_MIN_ENTRIES = 2;

/**
 * Spending of a stretch (a week) vs. the average of the previous ones (doc 03
 * §12). Only entries with spending count, so the weeks before the person
 * started using the app do not drag the average down; with fewer than
 * {@link AVERAGE_MIN_ENTRIES} of them there is nothing to compare (null).
 * Amounts are magnitudes (positive).
 */
export function compareToAverage(
  currentCents: number,
  historyCents: readonly number[],
): AverageComparison | null {
  assertCents(currentCents, "currentCents");
  if (currentCents < 0) {
    throw new RangeError(
      `currentCents must not be negative (received ${currentCents})`,
    );
  }
  const spent: number[] = [];
  for (const cents of historyCents) {
    assertCents(cents, "historyCents");
    if (cents > 0) spent.push(cents);
  }
  if (spent.length < AVERAGE_MIN_ENTRIES) return null;
  const average = spent.reduce((sum, cents) => sum + cents, 0) / spent.length;
  return {
    averageCents: Math.round(average),
    ratio: (currentCents - average) / average,
  };
}
