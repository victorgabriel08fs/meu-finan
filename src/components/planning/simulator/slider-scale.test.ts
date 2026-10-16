import { describe, expect, it } from "vitest";
import { sliderIndex, sliderMaxIndex, sliderValue } from "./slider-scale";

describe("money slider scale", () => {
  it("counts positions per tier", () => {
    // 0–1.000 by 50 (20) + 1.000–10.000 by 100 (90) + 10.000–50.000 by 1.000 (40)
    expect(sliderMaxIndex(50_000)).toBe(150);
    expect(sliderMaxIndex(500)).toBe(10);
  });

  it("maps positions to values with finer steps for small amounts", () => {
    expect(sliderValue(0, 50_000)).toBe(0);
    expect(sliderValue(1, 50_000)).toBe(50);
    expect(sliderValue(20, 50_000)).toBe(1_000);
    expect(sliderValue(21, 50_000)).toBe(1_100);
    expect(sliderValue(110, 50_000)).toBe(10_000);
    expect(sliderValue(111, 50_000)).toBe(11_000);
    expect(sliderValue(150, 50_000)).toBe(50_000);
    expect(sliderValue(999, 50_000)).toBe(50_000);
  });

  it("finds the nearest position for typed values", () => {
    expect(sliderIndex(0, 50_000)).toBe(0);
    expect(sliderIndex(1_000, 50_000)).toBe(20);
    expect(sliderIndex(1_049, 50_000)).toBe(20);
    expect(sliderIndex(1_051, 50_000)).toBe(21);
    expect(sliderIndex(10_000, 50_000)).toBe(110);
    expect(sliderIndex(80_000, 50_000)).toBe(150);
    expect(sliderIndex(Number.NaN, 50_000)).toBe(0);
  });

  it("round-trips every position", () => {
    const max = 1_000_000;
    for (let index = 0; index <= sliderMaxIndex(max); index += 7) {
      expect(sliderIndex(sliderValue(index, max), max)).toBe(index);
    }
  });
});
