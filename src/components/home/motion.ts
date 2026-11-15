import { EASE_ENTER, EASE_STANDARD } from "@/components/recap/motion";

/**
 * Timing of the public homepage (doc 02 §6.19): the Retrospectiva's tempos
 * (§3.8), tied to scrolling or to an element coming into view, once each.
 * Nothing loops and nothing moves without the person's hand. The CSS of the
 * page (globals.css, "Homepage") reads these through `HOME_MOTION_VARS`.
 */
export const HOME_REVEAL_MS = 480;
export const HOME_RISE_PX = 24;
export const HOME_STAGGER_MS = 100;
/** At most this many elements of a group are staggered. */
export const HOME_STAGGER_MAX = 4;
export const HOME_COUNT_MS = 1000;
export const HOME_GROW_MS = 800;
/** The p's stem dropping to its weight when the page loads. */
export const HOME_STEM_DROP_MS = 600;
export const HOME_STEM_DROP_PX = 40;
/** Values turning into "••••" (the app's own privacy swap). */
export const HOME_MASK_MS = 160;
export const HOME_ICON_MS = 360;
export const HOME_ICON_SCALE = 0.9;
/** The toast of the keypad example coming up. */
export const HOME_TOAST_MS = 240;
export const HOME_TOAST_RISE_PX = 8;
export const HOME_REDUCED_FADE_MS = 120;
/** Share of an element that must be on screen before it comes in. */
export const HOME_VIEW_AMOUNT = 0.3;

export { EASE_ENTER, EASE_STANDARD };

/** Seconds of delay of the nth element of a group (capped at the 4th). */
export function revealDelay(index: number): number {
  const step = Math.min(Math.max(index, 0), HOME_STAGGER_MAX - 1);
  return (step * HOME_STAGGER_MS) / 1000;
}

/** The same tempos for the page's CSS keyframes (set on `<main>`). */
export const HOME_MOTION_VARS = {
  "--home-reveal-ms": `${HOME_REVEAL_MS}ms`,
  "--home-rise-px": `${HOME_RISE_PX}px`,
  "--home-stagger-ms": `${HOME_STAGGER_MS}ms`,
  "--home-stem-ms": `${HOME_STEM_DROP_MS}ms`,
} as const;
