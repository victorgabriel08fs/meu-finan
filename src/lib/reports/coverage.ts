/**
 * Where a person's records begin (doc 02 §6.12): a month that ends before the
 * first one has nothing to report, however the balances project backwards.
 * Pure; dates are `YYYY-MM-DD`.
 */

/** The earliest of the dates that exist, or null when there is none. */
export function earliestDate(
  ...dates: readonly (string | null | undefined)[]
): string | null {
  let first: string | null = null;
  for (const date of dates) {
    if (date && (first === null || date < first)) first = date;
  }
  return first;
}

/**
 * Whether a period that ends on `periodEnd` closed before the first record.
 * Without a record at all nothing is "before", so the usual empty states apply.
 */
export function isBeforeFirstRecord(
  periodEnd: string,
  firstRecordOn: string | null,
): boolean {
  return firstRecordOn !== null && periodEnd < firstRecordOn;
}

/**
 * A monthly series (oldest first) without the months before the first record:
 * it keeps the month of the first record and the point just before it, which
 * is the base of the change. `firstMonth` is `YYYY-MM`; without one, or when
 * the series starts inside the records, nothing is cut.
 */
export function trimToFirstRecord<T extends { month: string }>(
  points: readonly T[],
  firstMonth: string | null,
): T[] {
  if (firstMonth === null) return [...points];
  const index = points.findIndex((point) => point.month >= firstMonth);
  return index <= 0 ? [...points] : points.slice(index - 1);
}
