/**
 * Timing of the Retrospectiva (doc 02 §3.8, "Retrospectiva" exception): the
 * only screen with long animations, each tied to a figure (a number that
 * counts, a bar that grows, a ring that closes), never a loop.
 */
export const RECAP_SLIDE_MS = 360;
export const RECAP_EXIT_MS = 200;
export const RECAP_SHIFT_PX = 48;
/** The content starts while the part is already half visible. */
export const RECAP_CONTENT_DELAY_MS = 180;
export const RECAP_REVEAL_MS = 480;
export const RECAP_RISE_PX = 24;
export const RECAP_STAGGER_MS = 100;
export const RECAP_COUNT_MS = 1000;
export const RECAP_GROW_MS = 800;
export const RECAP_RING_MS = 1000;
/** The single pulse of a part's highlight. */
export const RECAP_POP_MS = 480;
export const RECAP_DRIFT_MS = 900;
export const RECAP_WEEK_RISE_PX = 12;
export const RECAP_REDUCED_FADE_MS = 120;

export const EASE_ENTER = [0.05, 0.7, 0.1, 1] as const;
export const EASE_STANDARD = [0.2, 0, 0, 1] as const;
export const EASE_EXIT = [0.3, 0, 0.8, 0.15] as const;

/** Seconds of delay for the nth element of a part (at most 5 are staggered). */
export function stagger(
  index: number,
  base = RECAP_CONTENT_DELAY_MS / 1000,
): number {
  return base + (Math.min(index, 5) * RECAP_STAGGER_MS) / 1000;
}

/** Seconds until the nth of `count` weeks of the day strip has come in. */
export function weekEnd(index: number, count: number): number {
  const last = Math.min(index, count - 1, 5);
  return (
    RECAP_CONTENT_DELAY_MS / 1000 +
    (last * RECAP_STAGGER_MS + RECAP_REVEAL_MS) / 1000
  );
}

/** Seconds until the nth element has finished coming in. */
export function revealEnd(index: number): number {
  return stagger(index) + RECAP_REVEAL_MS / 1000;
}
