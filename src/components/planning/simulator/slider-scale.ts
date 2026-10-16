/**
 * Non-linear slider for money (doc 02 §6.11): R$ 50 steps up to R$ 1 mil,
 * R$ 100 up to R$ 10 mil and R$ 1 mil above it, so the slider is precise
 * where most values are. Positions are integers from 0 to `positions(max)`.
 */

export type SliderTier = { upTo: number; step: number };

/** Amounts in reais. */
export const MONEY_TIERS: readonly SliderTier[] = [
  { upTo: 1_000, step: 50 },
  { upTo: 10_000, step: 100 },
  { upTo: Number.POSITIVE_INFINITY, step: 1_000 },
];

function* segments(max: number, tiers: readonly SliderTier[]) {
  let from = 0;
  for (const tier of tiers) {
    if (from >= max) return;
    const to = Math.min(tier.upTo, max);
    yield {
      from,
      to,
      step: tier.step,
      count: Math.ceil((to - from) / tier.step),
    };
    from = to;
  }
}

/** Last position of a slider that goes from 0 to `max` reais. */
export function sliderMaxIndex(max: number, tiers = MONEY_TIERS): number {
  let total = 0;
  for (const segment of segments(max, tiers)) total += segment.count;
  return total;
}

/** Reais at a slider position. */
export function sliderValue(
  index: number,
  max: number,
  tiers = MONEY_TIERS,
): number {
  let remaining = Math.max(0, Math.round(index));
  for (const segment of segments(max, tiers)) {
    if (remaining <= segment.count) {
      return Math.min(segment.to, segment.from + remaining * segment.step);
    }
    remaining -= segment.count;
  }
  return max;
}

/** Slider position nearest to an amount in reais (values above `max` pin to the end). */
export function sliderIndex(
  value: number,
  max: number,
  tiers = MONEY_TIERS,
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  let base = 0;
  for (const segment of segments(max, tiers)) {
    if (value <= segment.to) {
      return (
        base +
        Math.min(
          segment.count,
          Math.round((value - segment.from) / segment.step),
        )
      );
    }
    base += segment.count;
  }
  return base;
}
