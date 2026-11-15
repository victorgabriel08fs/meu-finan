"use client";

import { useInView, useReducedMotion } from "motion/react";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { EASE_ENTER, HOME_VIEW_AMOUNT } from "./motion";

/**
 * - `rest`: the final state, as the server rendered it (also without JS, with
 *   reduced motion, and for whatever was already on screen at hydration).
 * - `armed`: below the fold after hydration, set back to its starting state.
 * - `play`: came into view, running its entrance once.
 */
export type Entrance = "rest" | "armed" | "play";

type EntranceOptions = {
  /** Share of the element on screen that starts it (default 0.3). */
  amount?: number;
  /** Root margin, e.g. "0px 0px -45% 0px" to wait for the middle of the screen. */
  margin?: `${number}${"px" | "%"} ${number}${"px" | "%"} ${number}${"px" | "%"} ${number}${"px" | "%"}`;
};

/**
 * Entrance of a homepage element, once. The server HTML is always the final,
 * visible state: only what is still below the fold after hydration is armed
 * (so the LCP never waits and nothing is hidden without JavaScript), and with
 * `prefers-reduced-motion` nothing is ever armed.
 */
export function useEntrance<T extends Element>({
  amount = HOME_VIEW_AMOUNT,
  margin,
}: EntranceOptions = {}): { ref: RefObject<T | null>; entrance: Entrance } {
  const ref = useRef<T>(null);
  const reduceMotion = useReducedMotion();
  const [armed, setArmed] = useState(false);
  const inView = useInView(ref, { once: true, amount, margin });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || reduceMotion) return;
    if (element.getBoundingClientRect().top >= window.innerHeight) {
      setArmed(true);
    }
  }, [reduceMotion]);

  return { ref, entrance: !armed ? "rest" : inView ? "play" : "armed" };
}

/**
 * Transition of an element driven by an `Entrance`: instant while it is put
 * in its starting state (and at rest), `ms` long once it plays.
 */
export function entranceTransition(
  entrance: Entrance,
  ms: number,
  delay = 0,
): { duration: number; delay?: number; ease?: typeof EASE_ENTER } {
  return entrance === "play"
    ? { duration: ms / 1000, delay, ease: EASE_ENTER }
    : { duration: 0 };
}
