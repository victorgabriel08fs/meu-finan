/** 0…1 progress to eased progress: ease-out cubic. */
export const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3;

type CountUpAtOptions = {
  durationMs: number;
  /** Time before the count starts; the value stays at `from` until then. */
  delayMs?: number;
  ease?: (progress: number) => number;
};

/**
 * The integer a count from `from` to `to` shows `elapsedMs` after it was
 * asked for: `from` during the delay, exactly `to` once the duration is over.
 */
export function countUpAt(
  from: number,
  to: number,
  elapsedMs: number,
  { durationMs, delayMs = 0, ease = easeOutCubic }: CountUpAtOptions,
): number {
  if (elapsedMs < delayMs) return from;
  if (elapsedMs >= delayMs + durationMs) return to;
  const progress = Math.max(0, Math.min(1, (elapsedMs - delayMs) / durationMs));
  return Math.round(from + (to - from) * ease(progress));
}
