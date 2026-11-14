/**
 * Timing of the Retrospectiva (doc 02 §3.8, "Retrospectiva" exception): the
 * only screen with long animations, each tied to a figure (a number that
 * counts, a bar that grows, a ring that closes), never a loop.
 */
export const RECAP_SLIDE_MS = 240;
export const RECAP_EXIT_MS = 160;
export const RECAP_STAGGER_MS = 60;
export const RECAP_COUNT_MS = 600;
export const RECAP_GROW_MS = 600;
export const RECAP_REDUCED_FADE_MS = 120;

export const EASE_ENTER = [0.05, 0.7, 0.1, 1] as const;
export const EASE_STANDARD = [0.2, 0, 0, 1] as const;
export const EASE_EXIT = [0.3, 0, 0.8, 0.15] as const;

/** Seconds of delay for the nth element of a part (at most 5 are staggered). */
export function stagger(index: number, base = 0): number {
  return base + (Math.min(index, 5) * RECAP_STAGGER_MS) / 1000;
}
