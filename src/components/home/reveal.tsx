"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import {
  EASE_ENTER,
  HOME_REVEAL_MS,
  HOME_RISE_PX,
  revealDelay,
} from "./motion";
import { useEntrance } from "./use-entrance";

const SHOWN = { opacity: 1, y: 0 };
const HIDDEN = { opacity: 0, y: HOME_RISE_PX };

/**
 * Content that comes in when scrolled to: fade with a 24px rise, once.
 * `index` staggers siblings (100ms each, capped at the 4th). Rendered visible
 * by the server; see `useEntrance`.
 */
export function Reveal({
  children,
  index = 0,
  className,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  const { ref, entrance } = useEntrance<HTMLDivElement>();
  return (
    <m.div
      ref={ref}
      initial={false}
      animate={entrance === "armed" ? HIDDEN : SHOWN}
      transition={
        entrance === "play"
          ? {
              duration: HOME_REVEAL_MS / 1000,
              ease: EASE_ENTER,
              delay: revealDelay(index),
            }
          : { duration: 0 }
      }
      className={className}
    >
      {children}
    </m.div>
  );
}
