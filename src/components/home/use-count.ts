"use client";

import {
  animate,
  type MotionValue,
  useMotionValue,
  useTransform,
} from "motion/react";
import { useEffect } from "react";
import { formatBRL } from "@/lib/format/money";
import { countTo } from "./model";
import { HOME_COUNT_MS } from "./motion";
import type { Entrance } from "./use-entrance";

/**
 * "R$ 0,00" counting up to `target` (cents) once the entrance plays, ending
 * exactly on it. At rest it is the final amount. Render it as the child of a
 * `motion.span`.
 */
export function useCountText(
  target: number,
  entrance: Entrance,
): MotionValue<string> {
  const time = useMotionValue(1);

  useEffect(() => {
    if (entrance === "armed") time.set(0);
    if (entrance !== "play") return;
    const controls = animate(time, 1, {
      duration: HOME_COUNT_MS / 1000,
      ease: "linear",
    });
    return () => controls.stop();
  }, [entrance, time]);

  return useTransform(time, (t) => formatBRL(countTo(target, t)));
}
