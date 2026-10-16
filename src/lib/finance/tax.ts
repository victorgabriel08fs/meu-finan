import { assertAtLeast } from "./guards";

/** `exempt` covers LCI/LCA and poupança; `none` ignores tax altogether. Both yield zero tax. */
export type TaxMode = "none" | "regressive" | "exempt";

export const TAX_MODES: readonly TaxMode[] = ["none", "regressive", "exempt"];

/** Regressive income tax on fixed income, by holding period (doc 03 §5). */
const BOUNDED_BRACKETS = [
  { maxDays: 180, rate: 0.225 },
  { maxDays: 360, rate: 0.2 },
  { maxDays: 720, rate: 0.175 },
] as const;

/** Rate above 720 days. */
export const LONG_TERM_TAX_RATE = 0.15;

/** 22.5% up to 180 days, 20% up to 360, 17.5% up to 720, 15% after that. */
export function incomeTaxRate(days: number): number {
  assertAtLeast(days, 0, "days");
  for (const bracket of BOUNDED_BRACKETS) {
    if (days <= bracket.maxDays) return bracket.rate;
  }
  return LONG_TERM_TAX_RATE;
}

/** Months to days at 365.25 / 12 per month: 12 months = 365 days (17.5%), not 360 (20%). */
export function monthsToDays(months: number): number {
  assertAtLeast(months, 0, "months");
  return Math.round((months * 365.25) / 12);
}
