import {
  assertAtLeast,
  assertFinite,
  assertInteger,
  assertOneOf,
  assertRate,
} from "./guards";
import {
  annualToMonthly,
  type RateInput,
  realRate,
  toMonthlyRate,
} from "./rates";
import { incomeTaxRate, monthsToDays, TAX_MODES, type TaxMode } from "./tax";

/** Contributions at the start or at the end (default) of each month. */
export type ContributionTiming = "start" | "end";

const TIMINGS: readonly ContributionTiming[] = ["start", "end"];

/** Upper bound accepted by `simulate` (100 years). The simulator UI stops at 600. */
export const MAX_SIMULATION_MONTHS = 1200;

/** Amounts in reais, unrounded (doc 03 §1). */
export type SimulationInput = {
  initial: number;
  monthly: number;
  months: number;
  rate: RateInput;
  timing?: ContributionTiming;
  /** 0.05 → the contribution grows 5% every 12 months. */
  contributionGrowthAnnual?: number;
  /** For values "em valores de hoje". */
  inflationAnnual?: number;
  tax?: TaxMode;
};

export type SimulationPoint = {
  month: number;
  invested: number;
  balance: number;
  interest: number;
  interestThisMonth: number;
  realBalance: number;
};

export type SimulationResult = {
  monthlyRate: number;
  /** Months 0..n. */
  series: SimulationPoint[];
  /** First month whose interest is at least that month's contribution. */
  crossoverMonth: number | null;
  final: {
    invested: number;
    gross: number;
    interest: number;
    tax: number;
    net: number;
    netReal: number;
  };
};

/** (1 + i)^n and the annuity factor ((1 + i)^n − 1) / i, both exact for tiny i. */
function growthFactors(i: number, n: number) {
  const exponent = n * Math.log1p(i);
  return {
    growth: Math.exp(exponent),
    annuity: i === 0 ? n : Math.expm1(exponent) / i,
  };
}

/**
 * Month-by-month simulation (doc 03 §4): series for the chart, crossover month,
 * yearly contribution growth and regressive income tax per contribution lot.
 * Throws RangeError for negative amounts, non-integer months or months above
 * MAX_SIMULATION_MONTHS, and rates at or below −100%.
 */
export function simulate(input: SimulationInput): SimulationResult {
  const { initial, monthly, months } = input;
  assertAtLeast(initial, 0, "initial");
  assertAtLeast(monthly, 0, "monthly");
  assertInteger(months, "months", 0, MAX_SIMULATION_MONTHS);
  const timing = input.timing ?? "end";
  assertOneOf(timing, TIMINGS, "timing");
  const taxMode = input.tax ?? "none";
  assertOneOf(taxMode, TAX_MODES, "tax");
  const growth = input.contributionGrowthAnnual ?? 0;
  assertRate(growth, "contributionGrowthAnnual");

  const i = toMonthlyRate(input.rate);
  const inflationMonthly = annualToMonthly(input.inflationAnnual ?? 0);
  const deflator = (month: number) =>
    Math.exp(month * Math.log1p(inflationMonthly));

  const lots: { month: number; amount: number }[] = [];
  let balance = initial;
  let invested = initial;
  if (initial > 0) lots.push({ month: 0, amount: initial });

  const series: SimulationPoint[] = [
    {
      month: 0,
      invested,
      balance,
      interest: 0,
      interestThisMonth: 0,
      realBalance: balance,
    },
  ];
  let crossoverMonth: number | null = null;

  for (let m = 1; m <= months; m++) {
    const contribution =
      monthly * Math.exp(Math.floor((m - 1) / 12) * Math.log1p(growth));
    if (timing === "start" && contribution > 0) {
      balance += contribution;
      invested += contribution;
      lots.push({ month: m - 1, amount: contribution });
    }
    const interestThisMonth = balance * i;
    balance += interestThisMonth;
    if (timing === "end" && contribution > 0) {
      balance += contribution;
      invested += contribution;
      lots.push({ month: m, amount: contribution });
    }
    if (
      crossoverMonth === null &&
      contribution > 0 &&
      interestThisMonth >= contribution
    ) {
      crossoverMonth = m;
    }
    series.push({
      month: m,
      invested,
      balance,
      interest: balance - invested,
      interestThisMonth,
      realBalance: balance / deflator(m),
    });
  }

  let tax = 0;
  if (taxMode === "regressive") {
    for (const lot of lots) {
      const held = months - lot.month;
      const gain = lot.amount * Math.expm1(held * Math.log1p(i));
      // Income tax applies to gains only: with a negative rate a lot loses
      // money and pays nothing (it must not become a negative tax).
      if (gain > 0) tax += gain * incomeTaxRate(monthsToDays(held));
    }
  }
  const net = balance - tax;
  return {
    monthlyRate: i,
    series,
    crossoverMonth,
    final: {
      invested,
      gross: balance,
      interest: balance - invested,
      tax,
      net,
      netReal: net / deflator(months),
    },
  };
}

/** FV = PV(1+i)^n + PMT·((1+i)^n − 1)/i·(1 + i·t), t = 1 when contributions come at the start. No tax, no growth. */
export function futureValue(
  pv: number,
  pmt: number,
  i: number,
  n: number,
  timing: ContributionTiming = "end",
): number {
  assertFinite(pv, "pv");
  assertFinite(pmt, "pmt");
  assertRate(i, "i");
  assertAtLeast(n, 0, "n");
  assertOneOf(timing, TIMINGS, "timing");
  const { growth, annuity } = growthFactors(i, n);
  return pv * growth + pmt * annuity * (timing === "start" ? 1 + i : 1);
}

/**
 * Monthly contribution that reaches `fv` in `n` months (never negative). With
 * `n = 0` it is 0 when `pv` already reaches `fv`, otherwise Infinity.
 */
export function requiredPayment(
  fv: number,
  pv: number,
  i: number,
  n: number,
  timing: ContributionTiming = "end",
): number {
  assertFinite(fv, "fv");
  assertFinite(pv, "pv");
  assertRate(i, "i");
  assertAtLeast(n, 0, "n");
  assertOneOf(timing, TIMINGS, "timing");
  if (n === 0) return pv >= fv ? 0 : Number.POSITIVE_INFINITY;
  const { growth, annuity } = growthFactors(i, n);
  const factor = annuity * (timing === "start" ? 1 + i : 1);
  return Math.max(0, (fv - pv * growth) / factor);
}

/**
 * Months (fractional) until the balance reaches `fv`; round up for whole
 * months. 0 when `pv` already reaches it, null when it is never reached.
 */
export function periodsToReach(
  fv: number,
  pv: number,
  pmt: number,
  i: number,
  timing: ContributionTiming = "end",
): number | null {
  assertFinite(fv, "fv");
  assertFinite(pv, "pv");
  assertFinite(pmt, "pmt");
  assertRate(i, "i");
  assertOneOf(timing, TIMINGS, "timing");
  if (pv >= fv) return 0;
  const p = pmt * (timing === "start" ? 1 + i : 1);
  if (i === 0) return p > 0 ? (fv - pv) / p : null;
  const numerator = fv * i + p;
  const denominator = pv * i + p;
  if (numerator <= 0 || denominator <= 0) return null;
  // ln(numerator / denominator) written with log1p to stay exact for tiny i.
  return Math.log1p(((fv - pv) * i) / denominator) / Math.log1p(i);
}

/**
 * Monthly income that keeps the capital intact in today's money (doc 03 §6):
 * real value × real monthly rate (Fisher). Zero when the real rate or the
 * value is not positive.
 */
export function passiveMonthlyIncome(
  realValue: number,
  monthlyRate: number,
  inflationAnnual = 0,
): number {
  assertFinite(realValue, "realValue");
  const real = realRate(monthlyRate, annualToMonthly(inflationAnnual));
  return real > 0 && realValue > 0 ? realValue * real : 0;
}
