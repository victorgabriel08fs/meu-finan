import {
  MAX_SIMULATION_MONTHS,
  type SimulationInput,
  simulate,
} from "./compound";
import { assertFinite, assertInteger, assertOneOf } from "./guards";

/** Which final value the target refers to. */
export type SolveMeasure = "gross" | "net" | "netReal";

const MEASURES: readonly SolveMeasure[] = ["gross", "net", "netReal"];

/** Default horizon of "Em quanto tempo": 50 years. */
export const DEFAULT_MAX_MONTHS = 600;

/**
 * Smallest monthly contribution (rounded up to the cent) whose simulation
 * reaches `target`, honouring tax, inflation and contribution growth (doc 03
 * §7.2). 0 when the initial amount alone reaches it; null when no contribution
 * up to 2^41 × target does (e.g. `months` is 0).
 */
export function solveMonthly(
  target: number,
  base: Omit<SimulationInput, "monthly">,
  measure: SolveMeasure = "net",
): number | null {
  assertFinite(target, "target");
  assertOneOf(measure, MEASURES, "measure");
  const reach = (monthly: number) =>
    simulate({ ...base, monthly }).final[measure];
  if (reach(0) >= target) return 0;
  let low = 0;
  let high = Math.max(target, 1);
  for (let doublings = 0; reach(high) < target; doublings++) {
    if (doublings > 40) return null;
    high *= 2;
  }
  for (let step = 0; step < 60; step++) {
    const mid = (low + high) / 2;
    if (reach(mid) >= target) high = mid;
    else low = mid;
  }
  return Math.ceil(high * 100) / 100;
}

/**
 * Smallest whole number of months whose simulation reaches `target`. 0 when it
 * is already reached; null when `maxMonths` is not enough ("não chega em 50
 * anos"). Assumes the measure grows with time, true for gross and net with a
 * non-negative rate; with a negative real rate solve on `gross` (doc 03 §7.2).
 */
export function solveMonths(
  target: number,
  base: Omit<SimulationInput, "months">,
  measure: SolveMeasure = "net",
  maxMonths = DEFAULT_MAX_MONTHS,
): number | null {
  assertFinite(target, "target");
  assertOneOf(measure, MEASURES, "measure");
  assertInteger(maxMonths, "maxMonths", 0, MAX_SIMULATION_MONTHS);
  const reach = (months: number) =>
    simulate({ ...base, months }).final[measure];
  if (reach(0) >= target) return 0;
  if (reach(maxMonths) < target) return null;
  let low = 0;
  let high = maxMonths;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (reach(mid) >= target) high = mid;
    else low = mid;
  }
  return high;
}
