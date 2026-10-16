import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assertCents,
  centsToReais,
  isCents,
  parseBRLToCents,
  reaisToCents,
  sumCents,
} from "./money";

describe("cents", () => {
  it("are safe integers", () => {
    expect([0, -6450, 123_456, Number.MAX_SAFE_INTEGER].every(isCents)).toBe(
      true,
    );
    expect(
      [0.5, Number.NaN, Infinity, 2 ** 53, "100", 100n].some(isCents),
    ).toBe(false);
    expect(() => assertCents(64.5, "price")).toThrow(
      "price must be an integer number of cents (received 64.5)",
    );
  });

  it("sum exactly, and refuse running totals beyond the safe range", () => {
    expect(sumCents([])).toBe(0);
    expect(sumCents([10, 20, -5])).toBe(25);
    expect(sumCents(new Set([1, 2, 3]))).toBe(6);
    expect(() => sumCents([1, 0.5])).toThrow(RangeError);
    // 2^53 − 1 + 2 is not exact even though subtracting 2 again "fits".
    expect(() => sumCents([Number.MAX_SAFE_INTEGER, 2, -2])).toThrow(/sum/);
  });

  it("convert to reais and back", () => {
    expect(centsToReais(123_456)).toBe(1234.56);
    expect(centsToReais(-1)).toBe(-0.01);
    expect(() => centsToReais(1.5)).toThrow(RangeError);
    fc.assert(
      fc.property(fc.integer({ min: -1e13, max: 1e13 }), (cents) => {
        expect(reaisToCents(centsToReais(cents))).toBe(cents);
      }),
      { numRuns: 200 },
    );
  });
});

describe("reaisToCents", () => {
  it("rounds half away from zero on the decimal form (1.005 → 101)", () => {
    expect(reaisToCents(1.005)).toBe(101);
    expect(Math.round(1.005 * 100)).toBe(100); // the bug it avoids
    expect(reaisToCents(-1.005)).toBe(-101);
    expect(reaisToCents(0.125)).toBe(13);
    expect(reaisToCents(0.124_999)).toBe(12);
    expect(reaisToCents(930.215)).toBe(93_022);
    expect(reaisToCents(0.1 + 0.2)).toBe(30);
    expect(reaisToCents(-0.001)).toBe(0);
    expect(Object.is(reaisToCents(-0.001), -0)).toBe(false);
  });

  it("handles exponent notation: tiny values are 0, huge ones are refused", () => {
    expect(reaisToCents(1e-7)).toBe(0);
    expect(reaisToCents(-5e-7)).toBe(0);
    expect(() => reaisToCents(1e21)).toThrow(RangeError);
    expect(() => reaisToCents(1e17)).toThrow(RangeError);
    expect(() => reaisToCents(Number.NaN)).toThrow(RangeError);
    expect(() => reaisToCents(Infinity)).toThrow(
      /reais must be a finite amount/,
    );
  });
});

describe("parseBRLToCents", () => {
  it.each([
    ["1.234,56", 123_456],
    ["R$ 1.234,56", 123_456],
    ["R$ 1.234,56", 123_456],
    ["-R$ 64,50", -6450],
    ["R$ -64,50", -6450],
    ["−R$ 64,50", -6450],
    ["R$ −64,50", -6450],
    ["+R$ 7.800,00", 780_000],
    ["1234", 123_400],
    ["1.234", 123_400],
    ["1.234.567,8", 123_456_780],
    ["12.5", 1250],
    ["12.50", 1250],
    [",5", 50],
    ["0,999", 100],
    ["0,994", 99],
    ["  64 , 50 ", 6450],
    ["−0,00", 0],
  ])("%s → %d", (input, cents) => {
    expect(parseBRLToCents(input)).toBe(cents);
  });

  it.each([
    "",
    "R$",
    "-",
    ",",
    "R$ -,",
    "abc",
    "1,2,3",
    "12.34.56",
    "1.23,45",
    "12.345.6",
    ".5",
    "--5",
    "-R$-5",
    "1e3",
    "R$ 1.234,56 mil",
  ])("%j is not an amount", (input) => {
    expect(parseBRLToCents(input)).toBeNull();
  });

  it("takes numbers as reais and rejects other types", () => {
    expect(parseBRLToCents(64.5)).toBe(6450);
    expect(parseBRLToCents(-0.005)).toBe(-1);
    expect(parseBRLToCents(Number.NaN)).toBeNull();
    expect(parseBRLToCents(null as unknown as string)).toBeNull();
    expect(parseBRLToCents("99999999999999999999")).toBeNull();
  });
});
