/**
 * The review step's rules (doc 02 §6.13, step 3), pure so they are tested
 * apart from the screen: what starts selected, the counters, the filters,
 * grouping by day and spreading a category to look-alike rows.
 */
import { merchantKey } from "@/lib/import/suggest";
import type { ReviewRow } from "@/server/domain/imports";

export type ReviewFilter = "all" | "new" | "duplicate" | "maybe";

export type ReviewCounts = {
  total: number;
  /** Not in the account yet (flagged balances and card payments included). */
  fresh: number;
  /** Same external id already in the account: cannot be imported again. */
  duplicate: number;
  /** Looks like an entry typed by hand (same amount, ±1 day). */
  maybe: number;
};

/** An exact duplicate would be skipped by the unique index anyway. */
export const isSelectable = (row: ReviewRow) => row.status !== "duplicate";

/**
 * What starts checked: only new rows without a flag. A look-alike of an
 * entry typed by hand starts unchecked — importing it would count the same
 * money twice, while leaving it out costs one tap to fix — and so do
 * balance lines and card invoice payments (those are transfers, recorded in
 * "Pagar fatura").
 */
export function defaultSelection(rows: readonly ReviewRow[]): Set<number> {
  const selected = new Set<number>();
  for (const [index, row] of rows.entries()) {
    if (row.status === "new" && row.flag === null) selected.add(index);
  }
  return selected;
}

export function reviewCounts(rows: readonly ReviewRow[]): ReviewCounts {
  const counts = { total: rows.length, fresh: 0, duplicate: 0, maybe: 0 };
  for (const row of rows) {
    if (row.status === "duplicate") counts.duplicate += 1;
    else if (row.status === "maybe") counts.maybe += 1;
    else counts.fresh += 1;
  }
  return counts;
}

export function matchesFilter(row: ReviewRow, filter: ReviewFilter): boolean {
  return filter === "all" || row.status === filter;
}

export type DayGroup = { date: string; indexes: number[] };

/** Newest day first (like the statement); within a day, the order of the file. */
export function orderByDay(
  rows: readonly ReviewRow[],
  indexes: readonly number[],
): number[] {
  return [...indexes].sort((a, b) => {
    const dateA = rows[a]?.occurredOn ?? "";
    const dateB = rows[b]?.occurredOn ?? "";
    return dateA === dateB ? a - b : dateA < dateB ? 1 : -1;
  });
}

/** Indexes grouped by day, in {@link orderByDay} order. */
export function groupByDay(
  rows: readonly ReviewRow[],
  indexes: readonly number[],
): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const index of orderByDay(rows, indexes)) {
    const date = rows[index]?.occurredOn ?? "";
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.indexes.push(index);
    else groups.push({ date, indexes: [index] });
  }
  return groups;
}

/**
 * Sets the category of one row and of the other rows of the same merchant
 * and kind that the user has not changed yet ("UBER *TRIP" ten times: one
 * choice covers all). Returns the new list and how many other rows changed.
 */
export function spreadCategory(
  rows: readonly ReviewRow[],
  current: readonly (string | null)[],
  touched: ReadonlySet<number>,
  index: number,
  categoryId: string | null,
): { categories: (string | null)[]; spread: number } {
  const categories = [...current];
  categories[index] = categoryId;
  const source = rows[index];
  if (!source) return { categories, spread: 0 };
  const key = merchantKey(source.description);
  let spread = 0;
  if (key === "" || categoryId === null) return { categories, spread };
  for (const [other, row] of rows.entries()) {
    if (other === index || touched.has(other)) continue;
    if (row.status === "duplicate" || row.kind !== source.kind) continue;
    if (categories[other] === categoryId) continue;
    if (merchantKey(row.description) !== key) continue;
    categories[other] = categoryId;
    spread += 1;
  }
  return { categories, spread };
}
