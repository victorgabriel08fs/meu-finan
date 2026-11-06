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
