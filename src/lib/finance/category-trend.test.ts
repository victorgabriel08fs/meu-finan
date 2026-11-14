import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  categoryTrend,
  findUnusualSpending,
  isUnusualSpending,
  UNUSUAL_SPENDING_MIN_DAYS,
  UNUSUAL_SPENDING_MIN_DIFF_CENTS,
} from "./category-trend";

const row = (key: string, currentCents: number, historyCents: number[]) => ({
  key,
  currentCents,
  historyCents,
});

describe("categoryTrend", () => {
  it("compares with the average rounded to the cent", () => {
    expect(categoryTrend(20_000, [10_000, 10_000, 10_001])).toEqual({
      currentCents: 20_000,
      baselineCents: 10_000,
      averageCents: 10_000,
      diffCents: 10_000,
      ratio: 1,
      direction: "up",
    });
    expect(categoryTrend(0, [1, 1, 2])?.averageCents).toBe(1);
    expect(categoryTrend(0, [1, 2, 2])?.averageCents).toBe(2);
  });

  it("has no pattern without history or with a window without spending", () => {
    expect(categoryTrend(10_000, [])).toBeNull();
    expect(categoryTrend(10_000, [5_000, 0, 5_000])).toBeNull();
    expect(categoryTrend(10_000, [5_000, -1, 5_000])).toBeNull();
  });

  it("throws for amounts that are not cents or a negative current", () => {
    expect(() => categoryTrend(-1, [5_000])).toThrow(RangeError);
    expect(() => categoryTrend(-1, [0])).toThrow(RangeError);
    expect(() => categoryTrend(1.5, [5_000])).toThrow(RangeError);
    expect(() => categoryTrend(100, [5_000.5])).toThrow(RangeError);
  });
});

describe("isUnusualSpending", () => {
  const unusual = (current: number, history: number[]) => {
    const trend = categoryTrend(current, history);
    return trend !== null && isUnusualSpending(trend);
  };

  it("passes exactly at 40% and R$ 100 over an average of at least R$ 50", () => {
    // 40% and R$ 100 at once: average R$ 250.
    expect(unusual(35_000, [25_000, 25_000, 25_000])).toBe(true);
    expect(unusual(34_999, [25_000, 25_000, 25_000])).toBe(false);
  });

  it("needs R$ 100 over the average even past 40%", () => {
    // Average R$ 200: +50% is only R$ 100 → passes; R$ 99,99 does not.
    expect(unusual(30_000, [20_000, 20_000, 20_000])).toBe(true);
    expect(unusual(29_999, [20_000, 20_000, 20_000])).toBe(false);
  });

  it("needs 40% over the average even past R$ 100", () => {
    // Average R$ 1.000: R$ 399,99 over is 39,999%.
    expect(unusual(139_999, [100_000, 100_000, 100_000])).toBe(false);
    expect(unusual(140_000, [100_000, 100_000, 100_000])).toBe(true);
  });

  it("ignores an average below R$ 50", () => {
    expect(unusual(100_000, [4_999, 4_999, 4_999])).toBe(false);
    expect(unusual(100_000, [5_000, 5_000, 5_000])).toBe(true);
  });
});

describe("findUnusualSpending", () => {
  const rows = [
    row("lazer", 40_000, [20_000, 20_000, 20_000]),
    row("mercado", 82_000, [58_500, 58_500, 58_500]),
    row("casa", 30_000, [10_000, 10_000, 10_000]),
    row("farmacia", 10_000, [9_000, 9_000, 9_000]),
    row("novo", 50_000, [0, 10_000, 10_000]),
  ];

  it("returns nothing before the 7th day", () => {
    expect(findUnusualSpending(rows, UNUSUAL_SPENDING_MIN_DAYS - 1)).toEqual(
      [],
    );
    expect(
      findUnusualSpending(rows, UNUSUAL_SPENDING_MIN_DAYS).length,
    ).toBeGreaterThan(0);
  });

  it("orders by diff, then ratio, then key", () => {
    expect(
      findUnusualSpending(rows, 10).map((item) => [item.key, item.diffCents]),
    ).toEqual([
      ["mercado", 23_500],
      ["casa", 20_000],
      ["lazer", 20_000],
    ]);
    expect(
      findUnusualSpending(
        [row("b", 30_000, [20_000]), row("a", 30_000, [20_000])],
        10,
      ).map((item) => item.key),
    ).toEqual(["a", "b"]);
  });

  it("throws for an invalid day count", () => {
    expect(() => findUnusualSpending(rows, -1)).toThrow(RangeError);
    expect(() => findUnusualSpending(rows, 7.5)).toThrow(RangeError);
  });

  const cents = fc.integer({ min: 0, max: 5_000_000 });
  const rowsArb = fc.uniqueArray(
    fc.record({
      key: fc.string({ minLength: 1, maxLength: 4 }),
      currentCents: cents,
      historyCents: fc.array(cents, { minLength: 1, maxLength: 3 }),
    }),
    { selector: (item) => item.key, maxLength: 12 },
  );

  it("every item is well over its average (property)", () => {
    fc.assert(
      fc.property(rowsArb, fc.integer({ min: 0, max: 31 }), (input, days) => {
        const output = findUnusualSpending(input, days);
        if (days < UNUSUAL_SPENDING_MIN_DAYS) return output.length === 0;
        return output.every(
          (item) =>
            item.currentCents >= Math.round(item.averageCents * 1.4) &&
            item.diffCents >= UNUSUAL_SPENDING_MIN_DIFF_CENTS &&
            input.some(
              (source) =>
                source.key === item.key &&
                source.currentCents === item.currentCents,
            ),
        );
      }),
    );
  });

  it("does not depend on the input order (property)", () => {
    fc.assert(
      fc.property(rowsArb, (input) => {
        const reversed = [...input].reverse();
        expect(findUnusualSpending(reversed, 10)).toEqual(
          findUnusualSpending(input, 10),
        );
      }),
    );
  });
});
