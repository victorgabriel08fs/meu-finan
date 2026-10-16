/**
 * Sequential scale of the spending heatmap (doc 02 §9.1: one hue, never a
 * rainbow): five steps of --primary mixed into the surface, so the light
 * theme runs light → dark and the dark theme dark → bright. Level 0 (no
 * spending) has no fill: the cell is outlined instead, because the lightest
 * step recedes towards the surface (fine for a sequential scale, but a day
 * with a little spending must not look like a day with none). Pure.
 */

export const HEAT_STEPS = 5;

/** Share of --primary in each step (even lightness steps in OKLab). */
const MIX = [18, 34, 50, 72, 100] as const;

/**
 * Level of each value (0 = nothing, 1…`steps`) by its rank among the
 * positive values — the empirical CDF, as contribution graphs do — so one
 * huge day (the rent) does not wash every other day out. Equal values share
 * a level and the largest is always the top step.
 */
export function heatLevels(
  values: readonly number[],
  steps = HEAT_STEPS,
): number[] {
  const positive = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const count = positive.length;
  return values.map((value) => {
    if (!Number.isFinite(value) || value <= 0 || count === 0) return 0;
    // Values ≤ this one, by binary search over the sorted copy.
    let lo = 0;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((positive[mid] as number) <= value) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(steps, Math.max(1, Math.ceil((steps * lo) / count)));
  });
}

/** CSS background of a step (1…5); null for level 0, which is outlined. */
export function heatFill(level: number): string | null {
  if (!(level >= 1)) return null;
  const share = MIX[Math.min(MIX.length, Math.round(level)) - 1] ?? 100;
  return share >= 100
    ? "var(--primary)"
    : `color-mix(in oklab, var(--primary) ${share}%, var(--surface))`;
}

/**
 * Text on a step, ≥ 4.5:1 in both themes: --text on the light steps, the
 * on-primary ink on the strongest ones (from step 4 in the dark theme, where
 * the steps get brighter).
 */
export function heatTextClass(level: number): string {
  if (level >= 5) return "text-on-primary";
  if (level === 4) return "text-fg dark:text-on-primary";
  return "text-fg";
}
