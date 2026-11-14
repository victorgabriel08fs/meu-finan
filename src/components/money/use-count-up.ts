"use client";

import { useEffect, useRef, useState } from "react";

type CountUpOptions = {
  /** Length of each count, in ms. */
  durationMs?: number;
  /** Where the first count starts; by default the value is already there. */
  initial?: number;
  /** Jump straight to the value (a caller's own reason, like privacy mode). */
  skip?: boolean;
  /** 0…1 progress to eased progress; defaults to ease-out cubic. */
  ease?: (progress: number) => number;
};

const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3;

/**
 * A value that counts from the one shown to `target` (doc 02 §6.11 "contagem
 * animada"); jumps straight there with reduced motion.
 */
export function useCountUp(
  target: number,
  {
    durationMs = 320,
    initial,
    skip = false,
    ease = easeOutCubic,
  }: CountUpOptions = {},
): number {
  const [value, setValue] = useState(initial ?? target);
  const shown = useRef(initial ?? target);

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
      const progress = Math.min(1, (now - start) / durationMs);
      const next = Math.round(from + (target - from) * ease(progress));
      shown.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, skip, ease]);

  return value;
}
