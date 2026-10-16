import { niceStep, niceTicks, type Ticks } from "./scale";

/**
 * Value-axis ticks for a line that may not start at zero (doc 02 §9.2: at
 * most 4 gridlines). Columns and areas keep `niceTicks`, which always
 * includes the zero baseline.
 */

/** The next nice step above `step` (1 → 2 → 2.5 → 5 → 10 …). */
function nextNiceStep(step: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(step) + 1e-9);
  const normalized = Math.round((step / magnitude) * 100) / 100;
  if (normalized < 2) return 2 * magnitude;
  if (normalized < 2.5) return 2.5 * magnitude;
  if (normalized < 5) return 5 * magnitude;
  return 10 * magnitude;
}

const clean = (value: number) => Number(value.toPrecision(12));

/** Nice ticks around [low, high] only, with at most `maxIntervals` intervals. */
export function rangeTicks(low: number, high: number, maxIntervals = 4): Ticks {
  let lo = Number.isFinite(low) ? low : 0;
  let hi = Number.isFinite(high) ? high : 0;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (hi === lo) {
    // A flat line sits in the middle of a small band around it.
    const pad = Math.max(1, Math.abs(lo) * 0.05);
    lo -= pad;
    hi += pad;
  }
  const intervals = Math.max(1, Math.floor(maxIntervals));
  let step = niceStep(hi - lo, intervals);
  let min = clean(Math.floor(lo / step) * step);
  let max = clean(Math.ceil(hi / step) * step);
  for (let guard = 0; Math.round((max - min) / step) > intervals; guard++) {
    if (guard > 20) break;
    step = nextNiceStep(step);
    min = clean(Math.floor(lo / step) * step);
    max = clean(Math.ceil(hi / step) * step);
  }
  const count = Math.round((max - min) / step);
  const values = Array.from({ length: count + 1 }, (_, k) =>
    clean(min + k * step),
  );
  return { min, max, step, values };
}

/**
 * Ticks for a balance over time: from zero when the line comes near it (a
 * negative balance, or one that spans more than half the way down to zero),
 * otherwise zoomed in on the range so a large, steady balance still shows
 * its movement.
 */
export function balanceTicks(
  values: readonly number[],
  maxIntervals = 4,
): Ticks {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return niceTicks(0, 0, maxIntervals);
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const nearZero = low <= 0 || high <= 0 || low < high * 0.5;
  return nearZero
    ? niceTicks(low, high, maxIntervals)
    : rangeTicks(low, high, maxIntervals);
}
