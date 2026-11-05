import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareToAverage } from "./averages";

describe("compareToAverage", () => {
  it("compares with the average of the weeks with spending", () => {
    const result = compareToAverage(124_530, [150_000, 160_000, 140_000, 0]);
    expect(result?.averageCents).toBe(150_000);
    expect(result?.ratio).toBeCloseTo(-0.1698, 4);
  });

  it("is positive above the average and zero on it", () => {
    expect(compareToAverage(120_000, [100_000, 100_000])?.ratio).toBeCloseTo(
      0.2,
    );
    expect(compareToAverage(100_000, [100_000, 100_000])?.ratio).toBe(0);
    expect(compareToAverage(0, [100_000, 100_000])?.ratio).toBe(-1);
  });

  it("rounds the average to the cent", () => {
    expect(compareToAverage(1, [1, 2])?.averageCents).toBe(2);
  });

  it("needs at least two weeks with spending", () => {
    expect(compareToAverage(100_000, [])).toBeNull();
    expect(compareToAverage(100_000, [100_000])).toBeNull();
    expect(compareToAverage(100_000, [100_000, 0, 0, 0])).toBeNull();
    // Refunds can leave a week negative: it counts as no spending.
    expect(compareToAverage(100_000, [100_000, -5000])).toBeNull();
  });

  it("rejects invalid input", () => {
    expect(() => compareToAverage(1.5, [1, 2])).toThrow(RangeError);
    expect(() => compareToAverage(-1, [1, 2])).toThrow(RangeError);
    expect(() => compareToAverage(1, [1, Number.NaN])).toThrow(RangeError);
  });
});

describe("compareToAverage (properties)", () => {
  const cents = fc.integer({ min: -1_000_000, max: 10_000_000 });

  it("averages only the weeks with spending, and compares against it", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.array(cents, { maxLength: 8 }),
        (current, history) => {
          const spent = history.filter((week) => week > 0);
          const result = compareToAverage(current, history);
          if (spent.length < 2) {
            expect(result).toBeNull();
            return;
          }
          if (!result) throw new Error("expected a comparison");
          expect(Number.isSafeInteger(result.averageCents)).toBe(true);
          expect(result.averageCents).toBeGreaterThanOrEqual(
            Math.min(...spent),
          );
          expect(result.averageCents).toBeLessThanOrEqual(Math.max(...spent));
          expect(result.ratio).toBeGreaterThanOrEqual(-1);
          // Above, below or on the (unrounded) average.
          const sum = spent.reduce((total, week) => total + week, 0);
          expect(Math.sign(result.ratio)).toBe(
            Math.sign(current * spent.length - sum),
          );
        },
      ),
    );
  });
});
