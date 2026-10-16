import { describe, expect, it } from "vitest";
import { requiredPayment, simulate } from "./compound";
import { DEFAULT_MAX_MONTHS, solveMonthly, solveMonths } from "./solve";

const rate = { kind: "monthly", value: 0.01 } as const;

describe("solveMonthly", () => {
  it("matches the closed form without tax, rounded up to the cent", () => {
    const solved = solveMonthly(
      10_000,
      { initial: 0, months: 24, rate },
      "gross",
    );
    const formula = requiredPayment(10_000, 0, 0.01, 24);
    expect(solved).toBe(Math.ceil(formula * 100) / 100);
  });

  it("asks for more when the target is net of tax, and the answer reaches it", () => {
    const base = { initial: 0, months: 24, rate, tax: "regressive" } as const;
    const gross = solveMonthly(10_000, base, "gross") ?? 0;
    const net = solveMonthly(10_000, base) ?? 0;
    expect(net).toBeGreaterThan(gross);
    expect(
      simulate({ ...base, monthly: net }).final.net,
    ).toBeGreaterThanOrEqual(10_000);
  });

  it("solves on today's money with inflation", () => {
    const base = { initial: 0, months: 24, rate, inflationAnnual: 0.045 };
    const real = solveMonthly(10_000, base, "netReal") ?? 0;
    expect(real).toBeGreaterThan(solveMonthly(10_000, base, "net") ?? 0);
    expect(
      simulate({ ...base, monthly: real }).final.netReal,
    ).toBeGreaterThanOrEqual(10_000);
  });

  it("is 0 when the initial amount alone reaches the target", () => {
    expect(solveMonthly(1000, { initial: 1000, months: 0, rate })).toBe(0);
    expect(solveMonthly(1050, { initial: 1000, months: 12, rate })).toBe(0);
  });

  it("is null when no contribution can reach it (zero months)", () => {
    expect(solveMonthly(1000, { initial: 0, months: 0, rate })).toBeNull();
  });

  it("works for tiny targets (search starts at R$ 1)", () => {
    expect(solveMonthly(0.5, { initial: 0, months: 1, rate }, "gross")).toBe(
      0.5,
    );
  });

  it("rejects invalid input", () => {
    expect(() =>
      solveMonthly(Number.NaN, { initial: 0, months: 1, rate }),
    ).toThrow(RangeError);
    expect(() =>
      solveMonthly(1, { initial: 0, months: 1, rate }, "real" as "net"),
    ).toThrow(RangeError);
    expect(() => solveMonthly(1000, { initial: -1, months: 1, rate })).toThrow(
      RangeError,
    );
  });
});

describe("solveMonths", () => {
  const base = { initial: 1000, monthly: 100, rate };

  it("finds the smallest whole number of months", () => {
    const months = solveMonths(3000, base, "gross") ?? 0;
    const gross = (n: number) => simulate({ ...base, months: n }).final.gross;
    expect(gross(months)).toBeGreaterThanOrEqual(3000);
    expect(gross(months - 1)).toBeLessThan(3000);
  });

  it("takes longer for a target net of tax", () => {
    const withTax = { ...base, tax: "regressive" } as const;
    const gross = solveMonths(50_000, withTax, "gross") ?? 0;
    const net = solveMonths(50_000, withTax) ?? 0;
    expect(net).toBeGreaterThanOrEqual(gross);
  });

  it("is 0 when already reached and null when the horizon is not enough", () => {
    expect(solveMonths(1000, base)).toBe(0);
    expect(solveMonths(1e12, base)).toBeNull();
    expect(solveMonths(5000, base, "gross", 12)).toBeNull();
    expect(solveMonths(1100, base, "gross", 1)).toBe(1);
    expect(DEFAULT_MAX_MONTHS).toBe(600);
  });

  it("rejects invalid input", () => {
    expect(() => solveMonths(Number.NaN, base)).toThrow(RangeError);
    expect(() => solveMonths(1, base, "x" as "net")).toThrow(RangeError);
    expect(() => solveMonths(1, base, "net", 1.5)).toThrow(RangeError);
    expect(() => solveMonths(1, base, "net", 5000)).toThrow(RangeError);
  });
});
