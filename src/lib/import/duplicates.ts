/**
 * "Talvez já exista": rows of the file that look like an entry already in the
 * account — typed by hand, or imported from another file or format — with
 * the same amount and a date at most a day apart (banks post card purchases
 * and PIX a day late).
 */

export type ExistingEntry = {
  id: string;
  occurredOn: string;
  /** Signed cents, as in the ledger (negative = money out). */
  amountCents: number;
  description: string;
};

export type CandidateRow = {
  /** Any key the caller uses to find the row again. */
  key: number;
  occurredOn: string;
  amountCents: number;
};

const dayNumber = (iso: string) =>
  Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  ) / 86_400_000;

/**
 * Pairs rows with existing entries one to one, so two identical coffees in
 * the file and one typed by hand flag only one row. Same-day pairs are made
 * first, for every row, and only then the ±`windowDays` ones (closest date
 * first); rows are taken in the order given.
 */
export function matchLikelyDuplicates(
  rows: readonly CandidateRow[],
  existing: readonly ExistingEntry[],
  windowDays = 1,
): Map<number, ExistingEntry> {
  const byAmount = new Map<number, ExistingEntry[]>();
  for (const entry of existing) {
    const list = byAmount.get(entry.amountCents) ?? [];
    list.push(entry);
    byAmount.set(entry.amountCents, list);
  }
  const used = new Set<string>();
  const matches = new Map<number, ExistingEntry>();
  for (let distance = 0; distance <= windowDays; distance += 1) {
    for (const row of rows) {
      if (matches.has(row.key)) continue;
      const day = dayNumber(row.occurredOn);
      const candidates = byAmount.get(row.amountCents) ?? [];
      // Earlier date first when both sides are at the same distance.
      const found =
        candidates.find(
          (entry) =>
            !used.has(entry.id) &&
            dayNumber(entry.occurredOn) - day === -distance,
        ) ??
        candidates.find(
          (entry) =>
            !used.has(entry.id) &&
            dayNumber(entry.occurredOn) - day === distance,
        );
      if (found) {
        used.add(found.id);
        matches.set(row.key, found);
      }
    }
  }
  return matches;
}
