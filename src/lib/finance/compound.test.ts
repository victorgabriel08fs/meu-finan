import { describe, expect, it } from "vitest";
import {
  futureValue,
  MAX_SIMULATION_MONTHS,
  passiveMonthlyIncome,
  periodsToReach,
  requiredPayment,
  type SimulationInput,
  simulate,
} from "./compound";
import { annualToMonthly } from "./rates";

const monthly = (value: number) => ({ kind: "monthly", value }) as const;

const base: SimulationInput = {
  initial: 1000,
  monthly: 100,
  months: 12,
  rate: monthly(0.01),
};

describe("simulate", () => {
  it("returns the month-0 point and one point per month", () => {
    const result = simulate(base);
    expect(result.monthlyRate).toBe(0.01);
    expect(result.series).toHaveLength(13);
    expect(result.series[0]).toEqual({
      month: 0,
      invested: 1000,
      balance: 1000,
      interest: 0,
      interestThisMonth: 0,
      realBalance: 1000,
    });
    const first = result.series[1];
    expect(first.interestThisMonth).toBeCloseTo(10, 12);
    expect(first.balance).toBeCloseTo(1110, 12);
    expect(first.invested).toBe(1100);
    expect(first.interest).toBeCloseTo(10, 12);
    expect(result.final.gross).toBeCloseTo(futureValue(1000, 100, 0.01, 12), 9);
    expect(result.final.invested).toBe(2200);
    expect(result.final.interest).toBeCloseTo(result.final.gross - 2200, 9);
  });

  it("with contributions at the start of the month, they earn that month's interest", () => {
    const result = simulate({ ...base, timing: "start" });
    expect(result.series[1].interestThisMonth).toBeCloseTo(11, 12);
    expect(result.final.gross).toBeCloseTo(
      futureValue(1000, 100, 0.01, 12, "start"),
      9,
    );
  });

  it("with zero months, returns the initial amount untouched", () => {
    const result = simulate({ ...base, months: 0, tax: "regressive" });
    expect(result.series).toHaveLength(1);
    expect(result.crossoverMonth).toBeNull();
    expect(result.final).toEqual({
      invested: 1000,
      gross: 1000,
      interest: 0,
      tax: 0,
      net: 1000,
      netReal: 1000,
    });
  });

  it("with a zero rate, the balance is what was invested", () => {
    const result = simulate({
      ...base,
      rate: { kind: "annual", value: 0 },
      tax: "regressive",
      inflationAnnual: 0.045,
    });
    expect(result.final.gross).toBe(2200);
    expect(result.final.tax).toBe(0);
    expect(result.final.net).toBe(2200);
    expect(result.final.netReal).toBeCloseTo(2200 / 1.045, 9);
    expect(result.crossoverMonth).toBeNull();
  });

  it("with nothing invested, everything is zero", () => {
    const result = simulate({
      initial: 0,
      monthly: 0,
      months: 24,
      rate: monthly(0.01),
      tax: "regressive",
    });
    expect(result.final.gross).toBe(0);
    expect(result.final.tax).toBe(0);
    expect(result.crossoverMonth).toBeNull();
  });

  it("grows the contribution every 12 months", () => {
    const result = simulate({
      initial: 0,
      monthly: 100,
      months: 25,
      rate: monthly(0),
      contributionGrowthAnnual: 0.1,
    });
    const contribution = (m: number) =>
      result.series[m].invested - result.series[m - 1].invested;
    expect(contribution(1)).toBe(100);
    expect(contribution(12)).toBe(100);
    expect(contribution(13)).toBeCloseTo(110, 12);
    expect(contribution(24)).toBeCloseTo(110, 12);
    expect(contribution(25)).toBeCloseTo(121, 12);
  });

  it("deflates by the monthly equivalent of the annual inflation", () => {
    const result = simulate({ ...base, inflationAnnual: 0.045 });
    const deflator = (1 + annualToMonthly(0.045)) ** 12;
    expect(deflator).toBeCloseTo(1.045, 14);
    expect(result.series[12].realBalance).toBeCloseTo(
      result.final.gross / 1.045,
      9,
    );
    expect(result.final.netReal).toBeCloseTo(result.final.net / 1.045, 9);
  });

  it("finds the first month whose interest covers the contribution", () => {
    const result = simulate({
      initial: 10_000,
      monthly: 100,
      months: 3,
      rate: monthly(0.01),
    });
    expect(result.crossoverMonth).toBe(1);
    // 100/mês at 1%: the balance passes 10.000 after ln 2 / ln 1.01 ≈ 69.7
    // months, so month 71 is the first to earn ≥ 100 (on 70 months of balance).
    expect(simulate({ ...base, initial: 0, months: 600 }).crossoverMonth).toBe(
      71,
    );
  });

  it("taxes each contribution by its own holding period", () => {
    // One lot held 12 months (365 days → 17.5%), no contributions.
    const year = simulate({
      initial: 1000,
      monthly: 0,
      months: 12,
      rate: monthly(0.01),
      tax: "regressive",
    });
    const gain = 1000 * (1.01 ** 12 - 1);
    expect(year.final.tax).toBeCloseTo(gain * 0.175, 9);
    expect(year.final.net).toBeCloseTo(1000 + gain * 0.825, 9);

    // Same with monthly lots: the last ones pay 22.5% on a smaller gain.
    const lots = simulate({ ...base, tax: "regressive" });
    let expected = 1000 * (1.01 ** 12 - 1) * 0.175;
    for (let m = 1; m <= 12; m++) {
      const held = 12 - m;
      const rate = held <= 5 ? 0.225 : held <= 11 ? 0.2 : 0.175;
      expected += 100 * (1.01 ** held - 1) * rate;
    }
    expect(lots.final.tax).toBeCloseTo(expected, 9);
  });

  it("exempt and none pay no tax", () => {
    for (const tax of ["exempt", "none"] as const) {
      const result = simulate({ ...base, tax });
      expect(result.final.tax).toBe(0);
      expect(result.final.net).toBe(result.final.gross);
    }
  });

  it("does not turn losses into negative tax", () => {
    const result = simulate({
      ...base,
      rate: monthly(-0.01),
      tax: "regressive",
    });
    expect(result.final.gross).toBeLessThan(result.final.invested);
    expect(result.final.tax).toBe(0);
    expect(result.final.net).toBe(result.final.gross);
  });

  it("rejects invalid input", () => {
    const bad: Partial<SimulationInput>[] = [
      { initial: -1 },
      { monthly: -1 },
      { initial: Number.NaN },
      { months: -1 },
      { months: 1.5 },
      { months: MAX_SIMULATION_MONTHS + 1 },
      { timing: "middle" as "start" },
      { tax: "flat" as "none" },
      { contributionGrowthAnnual: -1 },
      { inflationAnnual: Number.POSITIVE_INFINITY },
      { rate: monthly(-1) },
    ];
    for (const patch of bad) {
      expect(
        () => simulate({ ...base, ...patch }),
        JSON.stringify(patch),
      ).toThrow(RangeError);
    }
    expect(
      simulate({ ...base, months: MAX_SIMULATION_MONTHS }).series,
    ).toHaveLength(MAX_SIMULATION_MONTHS + 1);
  });
});

describe("futureValue", () => {
  it("handles zero rate, zero months and both timings", () => {
    expect(futureValue(1000, 100, 0, 12)).toBe(2200);
    expect(futureValue(1000, 100, 0, 12, "start")).toBe(2200);
    expect(futureValue(1000, 100, 0.01, 0)).toBe(1000);
    expect(futureValue(0, 100, 0.01, 1)).toBeCloseTo(100, 12);
    expect(futureValue(0, 100, 0.01, 1, "start")).toBeCloseTo(101, 12);
  });

  it("rejects invalid input", () => {
    expect(() => futureValue(Number.NaN, 0, 0.01, 12)).toThrow(RangeError);
    expect(() => futureValue(0, Infinity, 0.01, 12)).toThrow(RangeError);
    expect(() => futureValue(0, 0, -1, 12)).toThrow(RangeError);
    expect(() => futureValue(0, 0, 0.01, -1)).toThrow(RangeError);
    expect(() => futureValue(0, 0, 0.01, 1, "later" as "end")).toThrow(
      RangeError,
    );
  });
});

describe("requiredPayment", () => {
  it("is the inverse of futureValue", () => {
    const pmt = requiredPayment(25_000, 9500, 0.01, 14);
    expect(futureValue(9500, pmt, 0.01, 14)).toBeCloseTo(25_000, 8);
    const start = requiredPayment(25_000, 9500, 0.01, 14, "start");
    expect(start).toBeLessThan(pmt);
    expect(futureValue(9500, start, 0.01, 14, "start")).toBeCloseTo(25_000, 8);
  });

  it("with a zero rate, splits the gap evenly", () => {
    expect(requiredPayment(2200, 1000, 0, 12)).toBe(100);
  });

  it("is never negative when the initial amount already gets there", () => {
    expect(requiredPayment(1000, 950, 0.01, 12)).toBe(0);
    expect(requiredPayment(1000, 2000, 0, 12)).toBe(0);
  });

  it("with zero months, is 0 if already reached and Infinity otherwise", () => {
    expect(requiredPayment(1000, 1000, 0.01, 0)).toBe(0);
    expect(requiredPayment(1000, 999, 0.01, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("rejects invalid input", () => {
    expect(() => requiredPayment(Number.NaN, 0, 0.01, 12)).toThrow(RangeError);
    expect(() => requiredPayment(1, Number.NaN, 0.01, 12)).toThrow(RangeError);
    expect(() => requiredPayment(1, 0, -2, 12)).toThrow(RangeError);
    expect(() => requiredPayment(1, 0, 0.01, -12)).toThrow(RangeError);
    expect(() => requiredPayment(1, 0, 0.01, 12, "x" as "end")).toThrow(
      RangeError,
    );
  });
});

describe("periodsToReach", () => {
  it("is 0 when already reached", () => {
    expect(periodsToReach(1000, 1000, 0, 0.01)).toBe(0);
    expect(periodsToReach(1000, 5000, 0, 0)).toBe(0);
  });

  it("with a zero rate, divides the gap by the contribution", () => {
    expect(periodsToReach(2200, 1000, 100, 0)).toBe(12);
    expect(periodsToReach(2200, 1000, 0, 0)).toBeNull();
  });

  it("solves the closed form for both timings", () => {
    const end = periodsToReach(
      futureValue(1000, 100, 0.01, 12),
      1000,
      100,
      0.01,
    );
    expect(end).toBeCloseTo(12, 10);
    const start = periodsToReach(
      futureValue(1000, 100, 0.01, 12, "start"),
      1000,
      100,
      0.01,
      "start",
    );
    expect(start).toBeCloseTo(12, 10);
    // Interest alone: ln 2 / ln 1.01 months to double.
    expect(periodsToReach(2000, 1000, 0, 0.01)).toBeCloseTo(
      Math.log(2) / Math.log(1.01),
      10,
    );
  });

  it("is null when the target is never reached", () => {
    expect(periodsToReach(1000, 0, 0, 0.01)).toBeNull();
    // A negative rate caps the balance at pmt / |i| = 10.000.
    expect(periodsToReach(20_000, 0, 100, -0.01)).toBeNull();
    // A debt growing faster than the contributions pay it.
    expect(periodsToReach(1000, -50_000, 100, 0.01)).toBeNull();
  });

  it("with a negative rate, still reaches targets below the cap", () => {
    const months = periodsToReach(5000, 0, 100, -0.01);
    expect(months).not.toBeNull();
    expect(futureValue(0, 100, -0.01, months ?? 0)).toBeCloseTo(5000, 6);
  });

  it("stays accurate for tiny rates (the limit is the zero-rate answer)", () => {
    expect(periodsToReach(2200, 1000, 100, 1e-15)).toBeCloseTo(12, 9);
  });

  it("rejects invalid input", () => {
    expect(() => periodsToReach(Number.NaN, 0, 1, 0.01)).toThrow(RangeError);
    expect(() => periodsToReach(1, Number.NaN, 1, 0.01)).toThrow(RangeError);
    expect(() => periodsToReach(1, 0, Number.NaN, 0.01)).toThrow(RangeError);
    expect(() => periodsToReach(1, 0, 1, -1)).toThrow(RangeError);
    expect(() => periodsToReach(1, 0, 1, 0.01, "x" as "end")).toThrow(
      RangeError,
    );
  });
});

describe("passiveMonthlyIncome", () => {
  it("is the real value times the real monthly rate", () => {
    const i = annualToMonthly(0.12);
    const inflation = annualToMonthly(0.045);
    expect(passiveMonthlyIncome(150_000, i, 0.045)).toBeCloseTo(
      150_000 * ((1 + i) / (1 + inflation) - 1),
      9,
    );
    expect(passiveMonthlyIncome(100_000, 0.01)).toBeCloseTo(1000, 9);
  });

  it("is zero when the money loses to inflation or there is no money", () => {
    expect(passiveMonthlyIncome(100_000, 0.003, 0.045)).toBe(0);
    expect(passiveMonthlyIncome(-100_000, 0.003, 0.045)).toBe(0);
    expect(passiveMonthlyIncome(0, 0.01)).toBe(0);
  });

  it("rejects invalid input", () => {
    expect(() => passiveMonthlyIncome(Number.NaN, 0.01)).toThrow(RangeError);
    expect(() => passiveMonthlyIncome(1, -1)).toThrow(RangeError);
  });
});
