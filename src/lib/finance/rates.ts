import { assertAtLeast, assertRate, show } from "./guards";

/** Rates are decimals: 0.01 = 1%. Annual rates convert by compound equivalence, never by /12. */
export type RateInput =
  | { kind: "monthly"; value: number }
  | { kind: "annual"; value: number }
  /** `pct` 1.02 = 102% do CDI; `cdiAnnual` is the CDI rate (base 252). */
  | { kind: "cdi"; pct: number; cdiAnnual: number }
  /** IPCA + `spread` (annual). */
  | { kind: "ipca"; spread: number; ipcaAnnual: number };

export const BUSINESS_DAYS_PER_YEAR = 252;

/** Savings rule: Selic above 8.5% a.a. pays 0.5% a.m. + TR, otherwise 70% of Selic + TR. */
export const SAVINGS_SELIC_THRESHOLD = 0.085;
export const SAVINGS_FIXED_MONTHLY = 0.005;
export const SAVINGS_SELIC_SHARE = 0.7;

/**
 * (1 + rate)^periods − 1. Uses log1p/expm1, which stay exact for tiny rates
 * where `Math.pow(1 + rate, periods) - 1` loses most significant digits.
 */
export function compoundRate(rate: number, periods: number): number {
  assertRate(rate, "rate");
  if (!Number.isFinite(periods)) {
    throw new RangeError(`periods must be finite (received ${show(periods)})`);
  }
  return Math.expm1(periods * Math.log1p(rate));
}

export function annualToMonthly(annual: number): number {
  return compoundRate(annual, 1 / 12);
}

export function monthlyToAnnual(monthly: number): number {
  return compoundRate(monthly, 12);
}

/** Annual rate to a business-day rate (CDI convention, 252 days). */
export function annualToDaily(annual: number): number {
  return compoundRate(annual, 1 / BUSINESS_DAYS_PER_YEAR);
}

/** Fisher: (1 + nominal) / (1 + inflation) − 1, for rates of the same period. */
export function realRate(nominal: number, inflation: number): number {
  assertRate(nominal, "nominal");
  assertRate(inflation, "inflation");
  return (nominal - inflation) / (1 + inflation);
}

/** Effective daily rate of `pct` of the CDI: the percentage applies to the daily rate. */
function cdiDailyRate(pct: number, cdiAnnual: number): number {
  assertAtLeast(pct, 0, "pct");
  const daily = pct * annualToDaily(cdiAnnual);
  assertRate(daily, "effective daily rate");
  return daily;
}

function ipcaAnnualRate(spread: number, ipcaAnnual: number): number {
  assertRate(spread, "spread");
  assertRate(ipcaAnnual, "ipcaAnnual");
  return ipcaAnnual + spread + ipcaAnnual * spread;
}

export function toMonthlyRate(rate: RateInput): number {
  switch (rate.kind) {
    case "monthly":
      assertRate(rate.value, "rate.value");
      return rate.value;
    case "annual":
      return annualToMonthly(rate.value);
    case "cdi":
      return compoundRate(
        cdiDailyRate(rate.pct, rate.cdiAnnual),
        BUSINESS_DAYS_PER_YEAR / 12,
      );
    case "ipca":
      return annualToMonthly(ipcaAnnualRate(rate.spread, rate.ipcaAnnual));
    default:
      return unknownKind(rate);
  }
}

/** Annual equivalent, e.g. 102% of a 13.65% CDI → 0.139411 (not 1.02 × 13.65%). */
export function toAnnualRate(rate: RateInput): number {
  switch (rate.kind) {
    case "monthly":
      return monthlyToAnnual(rate.value);
    case "annual":
      assertRate(rate.value, "rate.value");
      return rate.value;
    case "cdi":
      return compoundRate(
        cdiDailyRate(rate.pct, rate.cdiAnnual),
        BUSINESS_DAYS_PER_YEAR,
      );
    case "ipca":
      return ipcaAnnualRate(rate.spread, rate.ipcaAnnual);
    default:
      return unknownKind(rate);
  }
}

function unknownKind(rate: never): never {
  throw new RangeError(`Unknown rate kind (received ${show(rate)})`);
}

/** Poupança monthly yield for a Selic target and the monthly TR. */
export function savingsMonthlyRate(selicAnnual: number, trMonthly = 0): number {
  assertRate(selicAnnual, "selicAnnual");
  assertRate(trMonthly, "trMonthly");
  const base =
    selicAnnual > SAVINGS_SELIC_THRESHOLD
      ? SAVINGS_FIXED_MONTHLY
      : annualToMonthly(SAVINGS_SELIC_SHARE * selicAnnual);
  return base + trMonthly;
}

/** Compounds consecutive period rates: Π(1 + r) − 1 (e.g. 12 monthly IPCA values → 12-month IPCA). */
export function accumulateRates(rates: Iterable<number>): number {
  let logGrowth = 0;
  for (const rate of rates) {
    assertRate(rate, "rate");
    logGrowth += Math.log1p(rate);
  }
  return Math.expm1(logGrowth);
}
