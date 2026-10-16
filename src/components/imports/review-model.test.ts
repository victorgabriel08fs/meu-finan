import { describe, expect, it } from "vitest";
import type { ReviewRow } from "@/server/domain/imports";
import {
  defaultSelection,
  groupByDay,
  isSelectable,
  matchesFilter,
  orderByDay,
  reviewCounts,
  spreadCategory,
} from "./review-model";

const row = (overrides: Partial<ReviewRow>): ReviewRow => ({
  line: 1,
  occurredOn: "2026-10-14",
  amountCents: -1_000,
  description: "PADARIA",
  externalId: "h:1",
  flag: null,
  kind: "expense",
  status: "new",
  match: null,
  categoryId: null,
  suggestion: null,
  ...overrides,
});

const rows: ReviewRow[] = [
  row({
    externalId: "a",
    occurredOn: "2026-10-12",
    description: "UBER *TRIP 1",
  }),
  row({ externalId: "b", status: "duplicate" }),
  row({
    externalId: "c",
    status: "maybe",
    match: { description: "Padaria", occurredOn: "2026-10-13" },
  }),
  row({
    externalId: "d",
    flag: "balance",
    amountCents: 100_000,
    kind: "income",
  }),
  row({
    externalId: "e",
    occurredOn: "2026-10-12",
    description: "Uber *Trip 2",
  }),
  row({
    externalId: "f",
    occurredOn: "2026-10-15",
    description: "UBER *TRIP 3",
    amountCents: 500,
    kind: "income",
  }),
];

describe("review rules", () => {
  it("checks only new rows without a flag", () => {
    expect([...defaultSelection(rows)]).toEqual([0, 4, 5]);
    expect(isSelectable(rows[1] as ReviewRow)).toBe(false);
    expect(isSelectable(rows[2] as ReviewRow)).toBe(true);
  });

  it("counts new, duplicate and look-alike rows", () => {
    expect(reviewCounts(rows)).toEqual({
      total: 6,
      fresh: 4,
      duplicate: 1,
      maybe: 1,
    });
  });

  it("filters by status", () => {
    const of = (filter: Parameters<typeof matchesFilter>[1]) =>
      rows.flatMap((item, index) =>
        matchesFilter(item, filter) ? [index] : [],
      );
    expect(of("all")).toHaveLength(6);
    expect(of("new")).toEqual([0, 3, 4, 5]);
    expect(of("duplicate")).toEqual([1]);
    expect(of("maybe")).toEqual([2]);
  });

  it("orders newest day first, keeping the file order within a day", () => {
    expect(orderByDay(rows, [0, 1, 2, 3, 4, 5])).toEqual([5, 1, 2, 3, 0, 4]);
    expect(groupByDay(rows, [0, 4, 5, 1])).toEqual([
      { date: "2026-10-15", indexes: [5] },
      { date: "2026-10-14", indexes: [1] },
      { date: "2026-10-12", indexes: [0, 4] },
    ]);
  });
});

describe("spreadCategory", () => {
  const initial = rows.map((item) => item.categoryId);

  it("applies the choice to untouched rows of the same merchant and kind", () => {
    const result = spreadCategory(rows, initial, new Set(), 0, "transporte");
    expect(result.categories).toEqual([
      "transporte",
      null,
      null,
      null,
      "transporte",
      // Same merchant, but an income: left alone.
      null,
    ]);
    expect(result.spread).toBe(1);
  });

  it("respects rows the user already changed", () => {
    const result = spreadCategory(
      rows,
      ["x", null, null, null, "lazer", null],
      new Set([4]),
      0,
      "transporte",
    );
    expect(result.categories[4]).toBe("lazer");
    expect(result.spread).toBe(0);
  });

  it("clearing a category touches only that row", () => {
    const result = spreadCategory(
      rows,
      ["transporte", null, null, null, "transporte", null],
      new Set(),
      0,
      null,
    );
    expect(result.categories[0]).toBeNull();
    expect(result.categories[4]).toBe("transporte");
    expect(result.spread).toBe(0);
  });
});
