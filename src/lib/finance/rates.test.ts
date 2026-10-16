import { describe, expect, it } from "vitest";
import {
  accumulateRates,
  annualToDaily,
  annualToMonthly,
  compoundRate,
  monthlyToAnnual,
  type RateInput,
  realRate,
  savingsMonthlyRate,
  toAnnualRate,
  toMonthlyRate,
} from "./rates";

describe("conversions", () => {
  it("convert by compound equivalence, never by /12", () => {
    expect(annualToMonthly(0.12)).toBeCloseTo(0.009_488_792_934_583, 14);
    expect(annualToMonthly(0.12)).not.toBeCloseTo(0.12 / 12, 5);
    expect(monthlyToAnnual(0.01)).toBeCloseTo(0.126_825_030_131_97, 13);
    expect(annualToDaily(0.1365)).toBeCloseTo(0.000_507_880_373_26, 14);
    expect(compoundRate(0.01, 0)).toBe(0);
    expect(compoundRate(0, 12)).toBe(0);
  });

  it("handle zero and negative rates", () => {
    expect(annualToMonthly(0)).toBe(0);
    expect(monthlyToAnnual(-0.01)).toBeCloseTo(-0.113_615_128, 9);
    expect(annualToMonthly(monthlyToAnnual(-0.01))).toBeCloseTo(-0.01, 15);
  });

  it("stay exact for tiny rates, where (1 + r)^n − 1 loses digits", () => {
    // (1 + 1e-12)^12 − 1 = 12e-12 + 66e-24 + … (binomial expansion).
    const exact = 12e-12 + 66e-24;
    const relativeError = (value: number) => Math.abs(value - exact) / exact;
    expect(relativeError(compoundRate(1e-12, 12))).toBeLessThan(1e-14);
    expect(relativeError((1 + 1e-12) ** 12 - 1)).toBeGreaterThan(1e-5);
  });

  it("reject rates at or below −100% and non-finite periods", () => {
    expect(() => compoundRate(-1, 12)).toThrow(RangeError);
    expect(() => annualToMonthly(Number.NaN)).toThrow(RangeError);
    expect(() => compoundRate(0.01, Infinity)).toThrow(
      /periods must be finite/,
    );
  });

  it("computes the real rate with Fisher", () => {
    expect(realRate(0.12, 0.045)).toBeCloseTo(1.12 / 1.045 - 1, 15);
    expect(realRate(0.04, 0.04)).toBe(0);
    expect(realRate(0.03, 0.05)).toBeLessThan(0);
    expect(() => realRate(-1, 0)).toThrow(RangeError);
    expect(() => realRate(0, -1.5)).toThrow(RangeError);
  });

  it("accumulates consecutive rates (12-month IPCA)", () => {
    expect(accumulateRates([])).toBe(0);
    expect(accumulateRates([0.01, 0.02])).toBeCloseTo(1.01 * 1.02 - 1, 15);
    expect(accumulateRates(Array(12).fill(0.01))).toBeCloseTo(
      monthlyToAnnual(0.01),
      14,
    );
    expect(accumulateRates([0.0007, -0.0032])).toBeCloseTo(
      1.0007 * 0.9968 - 1,
      15,
    );
    expect(() => accumulateRates([0.01, -1])).toThrow(RangeError);
  });
});

describe("toMonthlyRate / toAnnualRate", () => {
  const cdi = (pct: number): RateInput => ({
    kind: "cdi",
    pct,
    cdiAnnual: 0.1365,
  });

  it("monthly and annual inputs", () => {
    expect(toMonthlyRate({ kind: "monthly", value: 0.0095 })).toBe(0.0095);
    expect(toMonthlyRate({ kind: "annual", value: 0.12 })).toBe(
      annualToMonthly(0.12),
    );
    expect(toAnnualRate({ kind: "annual", value: 0.12 })).toBe(0.12);
    expect(toAnnualRate({ kind: "monthly", value: 0.01 })).toBe(
      monthlyToAnnual(0.01),
    );
  });

  it("% do CDI multiplies the daily rate (252 business days)", () => {
    expect(toAnnualRate(cdi(1))).toBeCloseTo(0.1365, 14);
    expect(toAnnualRate(cdi(1.02))).toBeCloseTo(0.139_411, 6);
    expect(toAnnualRate(cdi(1.02))).toBeGreaterThan(1.02 * 0.1365);
    expect(toMonthlyRate(cdi(1.02))).toBeCloseTo(
      annualToMonthly(toAnnualRate(cdi(1.02))),
      15,
    );
    expect(toMonthlyRate(cdi(0))).toBe(0);
  });

  it("IPCA + spread composes the two rates", () => {
    const ipca: RateInput = { kind: "ipca", spread: 0.06, ipcaAnnual: 0.045 };
    expect(toAnnualRate(ipca)).toBeCloseTo(1.045 * 1.06 - 1, 15);
    expect(toMonthlyRate(ipca)).toBeCloseTo(
      annualToMonthly(1.045 * 1.06 - 1),
      15,
    );
  });

  it("reject invalid inputs", () => {
    expect(() => toMonthlyRate({ kind: "monthly", value: -1 })).toThrow(
      /rate\.value/,
    );
    expect(() => toAnnualRate({ kind: "annual", value: Number.NaN })).toThrow(
      RangeError,
    );
    expect(() => toMonthlyRate(cdi(-0.5))).toThrow(/pct/);
    // 1000% of a −50% CDI would lose more than everything every day.
    expect(() =>
      toAnnualRate({ kind: "cdi", pct: 1000, cdiAnnual: -0.5 }),
    ).toThrow(/effective daily rate/);
    expect(() =>
      toMonthlyRate({ kind: "ipca", spread: -1, ipcaAnnual: 0.04 }),
    ).toThrow(/spread/);
    expect(() =>
      toAnnualRate({ kind: "ipca", spread: 0.06, ipcaAnnual: -2 }),
    ).toThrow(/ipcaAnnual/);
    const unknown = { kind: "selic", value: 0.1 } as unknown as RateInput;
    expect(() => toMonthlyRate(unknown)).toThrow(/Unknown rate kind/);
    expect(() => toAnnualRate(unknown)).toThrow(/Unknown rate kind/);
  });
});

describe("savingsMonthlyRate (poupança)", () => {
  it("pays 0.5% a.m. + TR while Selic is above 8.5% a.a.", () => {
    expect(savingsMonthlyRate(0.15)).toBe(0.005);
    expect(savingsMonthlyRate(0.15, 0.0017)).toBeCloseTo(0.0067, 15);
  });

  it("pays 70% of Selic (compounded monthly) + TR at or below 8.5%", () => {
    expect(savingsMonthlyRate(0.07)).toBeCloseTo(annualToMonthly(0.049), 15);
    expect(savingsMonthlyRate(0.085)).toBeCloseTo(
      annualToMonthly(0.7 * 0.085),
      15,
    );
    expect(savingsMonthlyRate(0.085)).toBeLessThan(0.005);
    expect(savingsMonthlyRate(0.07, 0.001)).toBeCloseTo(
      annualToMonthly(0.049) + 0.001,
      15,
    );
  });

  it("rejects invalid rates", () => {
    expect(() => savingsMonthlyRate(Number.NaN)).toThrow(RangeError);
    expect(() => savingsMonthlyRate(0.1, -2)).toThrow(/trMonthly/);
  });
});
