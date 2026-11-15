"use client";

import { useEffect, useRef, useState } from "react";
import { countUpAt, easeOutCubic } from "./count-up";

type CountUpOptions = {
  /** Length of each count, in ms. */
  durationMs?: number;
  /** Wait before each count starts, in ms (the value stays put meanwhile). */
  delayMs?: number;
  /** Where the first count starts; by default the value is already there. */
  initial?: number;
  /** Jump straight to the value (a caller's own reason, like privacy mode). */
  skip?: boolean;
  /** 0…1 progress to eased progress; defaults to ease-out cubic. */
  ease?: (progress: number) => number;
};

/**
 * A value that counts from the one shown to `target` (doc 02 §6.11 "contagem
 * animada"); jumps straight there with reduced motion.
 */
export function useCountUp(
  target: number,
  {
    durationMs = 320,
    delayMs = 0,
    initial,
    skip = false,
    ease = easeOutCubic,
  }: CountUpOptions = {},
): number {
  const [value, setValue] = useState(initial ?? target);
  const shown = useRef(initial ?? target);
  // Kept out of the effect's dependencies: a new function on every render
  // would restart the count on every frame.
  const easeRef = useRef(ease);
  easeRef.current = ease;

  useEffect(() => {
    const from = shown.current;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (from === target || reduce || skip) {
      shown.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const next = countUpAt(from, target, elapsed, {
        durationMs,
        delayMs,
        ease: easeRef.current,
      });
      shown.current = next;
      setValue(next);
      if (elapsed < delayMs + durationMs) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, delayMs, skip]);

  return value;
}
