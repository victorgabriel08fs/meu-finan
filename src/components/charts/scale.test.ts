import { describe, expect, it } from "vitest";
import {
  areaPath,
  labelAnchor,
  linePath,
  nearestIndex,
  niceStep,
  niceTicks,
  percentOf,
  scaleLinear,
  topPercent,
} from "./scale";

describe("niceStep", () => {
  it("rounds to 1, 2, 2.5 or 5 times a power of ten", () => {
    expect(niceStep(16_000, 4)).toBe(5000);
    expect(niceStep(15_850, 4)).toBe(5000);
    expect(niceStep(1000, 4)).toBe(250);
    expect(niceStep(9, 3)).toBe(5);
    expect(niceStep(1, 4)).toBe(0.25);
  });

  it("falls back to 1 for empty or invalid spans", () => {
    expect(niceStep(0, 4)).toBe(1);
    expect(niceStep(Number.NaN, 4)).toBe(1);
    expect(niceStep(-5, 4)).toBe(1);
  });
});

describe("niceTicks", () => {
  it("starts at zero and covers the maximum in at most four intervals", () => {
    const ticks = niceTicks(0, 15_850);
    expect(ticks.min).toBe(0);
    expect(ticks.max).toBeGreaterThanOrEqual(15_850);
    expect(ticks.values[0]).toBe(0);
    expect(ticks.values.length - 1).toBeLessThanOrEqual(4);
    expect(ticks.values.at(-1)).toBe(ticks.max);
  });

  it("includes zero for negative data", () => {
    const ticks = niceTicks(-0.12, 0.44);
    expect(ticks.min).toBeLessThan(0);
    expect(ticks.values).toContain(0);
    expect(ticks.max).toBeGreaterThanOrEqual(0.44);
    expect(ticks.values.length - 1).toBeLessThanOrEqual(4);
  });

  it("handles a flat series", () => {
    const ticks = niceTicks(0, 0);
    expect(ticks.min).toBe(0);
    expect(ticks.max).toBeGreaterThan(0);
  });

  it("never leaves floating-point noise in the values", () => {
    const ticks = niceTicks(0, 0.3, 3);
    for (const value of ticks.values) {
      expect(String(value).length).toBeLessThan(8);
    }
  });

  it("keeps every interval count within the limit for many maxima", () => {
    for (let max = 1; max < 1e9; max *= 3.7) {
      const ticks = niceTicks(0, max, 4);
      expect(ticks.max).toBeGreaterThanOrEqual(max);
      expect(ticks.values.length - 1).toBeLessThanOrEqual(4);
      expect(ticks.values.length - 1).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("scales", () => {
  it("maps linearly and survives a flat domain", () => {
    const x = scaleLinear([0, 10], [0, 1000]);
    expect(x(5)).toBe(500);
    expect(scaleLinear([3, 3], [10, 20])(3)).toBe(10);
  });

  it("measures from the top of the plot", () => {
    expect(topPercent(0, { min: 0, max: 100 })).toBe(100);
    expect(topPercent(100, { min: 0, max: 100 })).toBe(0);
    expect(topPercent(0, { min: -50, max: 50 })).toBe(50);
  });

  it("clamps shares to 0–100", () => {
    expect(percentOf(50, 200)).toBe(25);
    expect(percentOf(500, 200)).toBe(100);
    expect(percentOf(-1, 200)).toBe(0);
    expect(percentOf(10, 0)).toBe(0);
  });
});

describe("paths", () => {
  it("draws a polyline and breaks it at gaps", () => {
    expect(linePath([[0, 10], [50, 20], null, [100, 5], [150, 6]])).toBe(
      "M0 10 L50 20 M100 5 L150 6",
    );
    expect(linePath([])).toBe("");
  });

  it("closes the area between two lines", () => {
    expect(
      areaPath(
        [
          [0, 10],
          [100, 0],
        ],
        [
          [0, 100],
          [100, 100],
        ],
      ),
    ).toBe("M0 10 L100 0 L100 100 L0 100 Z");
    expect(areaPath([], [])).toBe("");
  });

  it("rounds coordinates to two decimals", () => {
    expect(linePath([[1 / 3, 2 / 3]])).toBe("M0.33 0.67");
  });
});

describe("helpers", () => {
  it("finds the nearest stop", () => {
    expect(nearestIndex(0.49, [0, 0.25, 0.5, 0.75, 1])).toBe(2);
    expect(nearestIndex(2, [0, 1])).toBe(1);
    expect(nearestIndex(0.3, [])).toBe(0);
  });

  it("anchors edge labels inwards", () => {
    expect(labelAnchor(5)).toBe("start");
    expect(labelAnchor(50)).toBe("middle");
    expect(labelAnchor(95)).toBe("end");
  });
});
