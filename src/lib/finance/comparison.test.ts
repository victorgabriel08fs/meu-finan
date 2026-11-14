import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  compareAmounts,
  compareBreakdown,
  comparisonWindows,
  type DateWindow,
} from "./comparison";
import { addDays, compare, daysBetween, iso, parse } from "./dates";
import { periodContaining, periodForMonth, shiftPeriod } from "./period";

const isoWindow = (window: DateWindow | undefined) =>
  window ? `${iso(window.start)}..${iso(window.end)}` : null;

function windowsFor(startDay: number, today: string, label?: string) {
  const date = parse(today);
  const period = label
    ? periodForMonth(
        {
          year: Number(label.slice(0, 4)),
          month: Number(label.slice(5, 7)),
        },
        startDay,
      )
    : periodContaining(date, startDay);
  return comparisonWindows(period, [shiftPeriod(period, -1)], date);
}

describe("compareAmounts", () => {
  it("compares two magnitudes", () => {
    expect(compareAmounts(0, 0)).toEqual({
      currentCents: 0,
      baselineCents: 0,
      diffCents: 0,
      ratio: null,
      direction: "same",
    });
    expect(compareAmounts(500, 0)).toMatchObject({
      ratio: null,
      direction: "up",
    });
    expect(compareAmounts(0, 500)).toMatchObject({
      ratio: -1,
      direction: "down",
    });
    expect(compareAmounts(11_750, 10_000).ratio).toBeCloseTo(0.175);
  });

  it("rejects negative or fractional amounts", () => {
    expect(() => compareAmounts(-1, 0)).toThrow(RangeError);
    expect(() => compareAmounts(0, -1)).toThrow(RangeError);
    expect(() => compareAmounts(1.5, 0)).toThrow(RangeError);
    expect(() => compareAmounts(0, Number.NaN)).toThrow(RangeError);
  });
});

describe("compareBreakdown", () => {
  it("joins the keys, drops the empty ones and orders by the change", () => {
    const result = compareBreakdown(
      new Map([
        ["a", 1_000],
        ["b", 5_000],
        ["z", 0],
      ]),
      new Map([
        ["b", 2_000],
        ["c", 4_000],
        ["z", 0],
      ]),
    );
    expect(result.items.map((item) => item.key)).toEqual(["c", "b", "a"]);
    expect(result.items[0]).toMatchObject({ currentCents: 0, ratio: -1 });
    expect(result.items[2]).toMatchObject({ baselineCents: 0, ratio: null });
    expect(result.total).toMatchObject({
      currentCents: 6_000,
      baselineCents: 6_000,
      direction: "same",
    });
  });

  it("breaks ties by the current amount, then by key", () => {
    const result = compareBreakdown(
      new Map([
        ["b", 2_000],
        ["a", 2_000],
        ["c", 3_000],
      ]),
      new Map([
        ["b", 1_000],
        ["a", 1_000],
        ["c", 2_000],
      ]),
    );
    expect(result.items.map((item) => item.key)).toEqual(["c", "a", "b"]);
  });

  it("filters only the items", () => {
    const current = new Map([
      ["a", 10_000],
      ["b", 1_500],
      ["c", 999],
    ]);
    const baseline = new Map([["b", 1_000]]);
    const filtered = compareBreakdown(current, baseline, {
      minAbsDiffCents: 1_000,
    });
    expect(filtered.items.map((item) => item.key)).toEqual(["a"]);
    expect(filtered.total.currentCents).toBe(12_499);
    expect(compareBreakdown(current, baseline, { limit: 0 }).items).toEqual([]);
    expect(() => compareBreakdown(current, baseline, { limit: -1 })).toThrow(
      RangeError,
    );
    expect(() =>
      compareBreakdown(current, baseline, { minAbsDiffCents: 0.5 }),
    ).toThrow(RangeError);
  });
});

describe("comparisonWindows", () => {
  const show = (result: ReturnType<typeof windowsFor>) =>
    result && {
      current: isoWindow(result.current),
      previous: isoWindow(result.previous[0]),
      elapsedDays: result.elapsedDays,
      complete: result.complete,
    };

  it("compares days 1..E of the period with the same days of the one before", () => {
    expect(show(windowsFor(1, "2026-11-14"))).toEqual({
      current: "2026-11-01..2026-11-14",
      previous: "2026-10-01..2026-10-14",
      elapsedDays: 14,
      complete: false,
    });
    expect(show(windowsFor(1, "2027-01-14"))?.previous).toBe(
      "2026-12-01..2026-12-14",
    );
    expect(show(windowsFor(1, "2026-11-01"))).toMatchObject({
      current: "2026-11-01..2026-11-01",
      previous: "2026-10-01..2026-10-01",
    });
  });

  it("never runs into the next period when the previous one is shorter", () => {
    expect(show(windowsFor(1, "2027-03-30"))?.previous).toBe(
      "2027-02-01..2027-02-28",
    );
    expect(show(windowsFor(1, "2028-03-31"))?.previous).toBe(
      "2028-02-01..2028-02-29",
    );
    expect(show(windowsFor(5, "2027-04-03"))).toMatchObject({
      current: "2027-03-05..2027-04-03",
      previous: "2027-02-05..2027-03-04",
    });
  });

  it("compares whole periods from the last day on", () => {
    expect(show(windowsFor(1, "2026-11-30"))).toEqual({
      current: "2026-11-01..2026-11-30",
      previous: "2026-10-01..2026-10-31",
      elapsedDays: 30,
      complete: true,
    });
    expect(show(windowsFor(1, "2026-11-14", "2026-09"))).toMatchObject({
      current: "2026-09-01..2026-09-30",
      previous: "2026-08-01..2026-08-31",
      complete: true,
    });
  });

  it("has nothing to compare before the period starts", () => {
    expect(windowsFor(1, "2026-11-14", "2026-12")).toBeNull();
  });

  it("rejects a period that ends before it starts", () => {
    const today = parse("2026-11-14");
    expect(() =>
      comparisonWindows({ start: today, end: addDays(today, -1) }, [], today),
    ).toThrow(RangeError);
  });

  it("keeps every window inside its period (property)", () => {
    const day = fc
      .integer({ min: 0, max: 109_572 })
      .map((offset) => addDays({ year: 1900, month: 1, day: 1 }, offset));
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 28 }),
        day,
        fc.integer({ min: -2, max: 2 }),
        (startDay, today, shift) => {
          const period = shiftPeriod(periodContaining(today, startDay), shift);
          const previous = shiftPeriod(period, -1);
          const result = comparisonWindows(period, [previous], today);
          if (compare(today, period.start) < 0) {
            expect(result).toBeNull();
            return;
          }
          if (!result) throw new Error("expected windows");
          const [prev] = result.previous;
          if (!prev) throw new Error("expected a previous window");
          expect(result.current.start).toEqual(period.start);
          expect(compare(result.current.end, period.end)).toBeLessThanOrEqual(
            0,
          );
          expect(prev.start).toEqual(previous.start);
          expect(compare(prev.end, previous.end)).toBeLessThanOrEqual(0);
          const prevDays = daysBetween(prev.start, prev.end) + 1;
          const previousDays = daysBetween(previous.start, previous.end) + 1;
          expect(prevDays).toBe(
            result.complete
              ? previousDays
              : Math.min(result.elapsedDays, previousDays),
          );
        },
      ),
    );
  });
});

describe("compareBreakdown (properties)", () => {
  const breakdown = fc
    .dictionary(
      fc.constantFrom("a", "b", "c", "d", "e"),
      fc.integer({ min: 0, max: 1_000_000 }),
    )
    .map((record) => new Map(Object.entries(record)));

  it("adds up to the total and stays ordered", () => {
    fc.assert(
      fc.property(breakdown, breakdown, (current, baseline) => {
        const { total, items } = compareBreakdown(current, baseline);
        const sum = (pick: (item: (typeof items)[number]) => number) =>
          items.reduce((acc, item) => acc + pick(item), 0);
        expect(sum((item) => item.currentCents)).toBe(total.currentCents);
        expect(sum((item) => item.baselineCents)).toBe(total.baselineCents);
        expect(sum((item) => item.diffCents)).toBe(total.diffCents);
        for (let k = 1; k < items.length; k++) {
          expect(Math.abs(items[k - 1]?.diffCents ?? 0)).toBeGreaterThanOrEqual(
            Math.abs(items[k]?.diffCents ?? 0),
          );
        }
        expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
        const swapped = compareBreakdown(baseline, current);
        expect(swapped.total.diffCents + total.diffCents).toBe(0);
      }),
    );
  });

  it("limits to a prefix of the whole list", () => {
    fc.assert(
      fc.property(
        breakdown,
        breakdown,
        fc.integer({ min: 0, max: 6 }),
        (current, baseline, limit) => {
          const all = compareBreakdown(current, baseline).items;
          const some = compareBreakdown(current, baseline, { limit }).items;
          expect(some.length).toBeLessThanOrEqual(limit);
          expect(some).toEqual(all.slice(0, some.length));
        },
      ),
    );
  });
});

describe("compareAmounts (properties)", () => {
  it("diff, ratio and direction agree", () => {
    const cents = fc.integer({ min: 0, max: 100_000_000 });
    fc.assert(
      fc.property(cents, cents, (current, baseline) => {
        const change = compareAmounts(current, baseline);
        expect(change.diffCents).toBe(current - baseline);
        expect(change.ratio === null).toBe(baseline === 0);
        if (change.ratio !== null) {
          expect(
            Math.abs(current - baseline * (1 + change.ratio)),
          ).toBeLessThan(1e-6);
        }
        expect(change.direction).toBe(
          current > baseline ? "up" : current < baseline ? "down" : "same",
        );
      }),
    );
  });
});
