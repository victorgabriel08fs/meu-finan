/**
 * Vibration feedback (doc 02 §7.2): 8ms on keys, 12ms on save, [10, 40, 10]
 * on errors. Android/Chrome only; iOS has no Vibration API and the visual
 * feedback is enough there.
 */
export const HAPTIC = {
  key: 8,
  success: 12,
  error: [10, 40, 10],
} as const satisfies Record<string, number | readonly number[]>;

export function vibrate(pattern: number | readonly number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(
        typeof pattern === "number" ? pattern : Array.from(pattern),
      );
    }
  } catch {
    // Some browsers throw without a user gesture; feedback is optional.
  }
}
