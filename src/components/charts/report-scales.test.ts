import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HEAT_STEPS, heatFill, heatLevels, heatTextClass } from "./heat-scale";
import { balanceTicks, rangeTicks } from "./range-ticks";

describe("rangeTicks", () => {
  it("covers the range without reaching for zero", () => {
    const ticks = rangeTicks(20_512_300, 21_004_000);
    expect(ticks.min).toBeLessThanOrEqual(20_512_300);
    expect(ticks.max).toBeGreaterThanOrEqual(21_004_000);
    expect(ticks.min).toBeGreaterThan(0);
    expect(ticks.values.length - 1).toBeLessThanOrEqual(4);
    expect(ticks.values[0]).toBe(ticks.min);
    expect(ticks.values.at(-1)).toBe(ticks.max);
  });

  it("puts a flat line inside a small band, and accepts the ends swapped", () => {
    const flat = rangeTicks(100_000, 100_000);
    expect(flat.min).toBeLessThan(100_000);
    expect(flat.max).toBeGreaterThan(100_000);
    expect(rangeTicks(50, 10)).toEqual(rangeTicks(10, 50));
    expect(rangeTicks(Number.NaN, 10).min).toBeLessThanOrEqual(0);
  });

  // Two intervals at least: one cannot span both sides of zero on nice steps.
  it("never exceeds the interval budget", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000_000, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 2, max: 6 }),
        (low, span, intervals) => {
          const ticks = rangeTicks(low, low + span, intervals);
          return (
            ticks.values.length - 1 <= intervals &&
            ticks.min <= low &&
            ticks.max >= low + span
          );
        },
      ),
    );
  });
});

describe("balanceTicks", () => {
  it("starts from zero when the balance comes near it", () => {
    expect(balanceTicks([120_000, 30_000]).values).toContain(0);
    expect(balanceTicks([50_000, -20_000]).min).toBeLessThan(0);
    expect(balanceTicks([-5_000, -1_000]).max).toBe(0);
    expect(balanceTicks([]).values).toContain(0);
  });

  it("zooms in on a large, steady balance", () => {
    const ticks = balanceTicks([20_500_000, 21_000_000, 20_100_000]);
    expect(ticks.values).not.toContain(0);
    expect(ticks.min).toBeLessThanOrEqual(20_100_000);
  });
});

describe("heatLevels", () => {
  it("ranks the positive days into five steps", () => {
    expect(heatLevels([0, 10, 20, 50, 80, 300, 350, 500, 600, 2100])).toEqual([
      0, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ]);
  });

  it("gives equal values one level and the largest the top step", () => {
    expect(heatLevels([5, 5, 5])).toEqual([5, 5, 5]);
    expect(heatLevels([0, 900])).toEqual([0, 5]);
    expect(heatLevels([100, 200])).toEqual([3, 5]);
    expect(heatLevels([0, -10, Number.NaN])).toEqual([0, 0, 0]);
    expect(heatLevels([])).toEqual([]);
  });

  it("is monotone and stays within the steps", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000, max: 1_000_000 }), {
          maxLength: 31,
        }),
        (values) => {
          const levels = heatLevels(values);
          return values.every((a, i) =>
            values.every((b, j) => {
              const la = levels[i] as number;
              const lb = levels[j] as number;
              if (la < 0 || la > HEAT_STEPS) return false;
              if (a <= 0) return la === 0;
              return a <= b ? la <= lb : la >= lb;
            }),
          );
        },
      ),
    );
  });
});

describe("heat fills", () => {
  it("leaves level 0 unfilled and mixes --primary for the steps", () => {
    expect(heatFill(0)).toBeNull();
    expect(heatFill(1)).toBe(
      "color-mix(in oklab, var(--primary) 18%, var(--surface))",
    );
    expect(heatFill(4)).toContain("72%");
    expect(heatFill(5)).toBe("var(--primary)");
    expect(heatFill(9)).toBe("var(--primary)");
  });

  it("picks text that keeps 4.5:1 on each step", () => {
    expect(heatTextClass(1)).toBe("text-fg");
    expect(heatTextClass(3)).toBe("text-fg");
    expect(heatTextClass(4)).toBe("text-fg dark:text-on-primary");
    expect(heatTextClass(5)).toBe("text-on-primary");
  });
});
