"use client";

import { Delete } from "lucide-react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { formatBRL } from "@/lib/format/money";
import { DemoCard, DemoLabel } from "./home-section";
import { DEMO, typedAmount, typedKey, typedStep } from "./model";
import {
  EASE_ENTER,
  HOME_REVEAL_MS,
  HOME_TOAST_MS,
  HOME_TOAST_RISE_PX,
} from "./motion";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"];

/**
 * Section 2: the amount keypad. As the card scrolls in, "R$ 64,50" is typed
 * in three steps tied to the scroll (and untyped on the way back); at the
 * end the toast comes up over the keys. At rest (server, reduced motion):
 * the amount and the toast, still.
 */
export function DemoKeypad() {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  // 1 = typed; only a card still below the fold starts from zero.
  const [progress, setProgress] = useState(1);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.9", "start 0.4"],
  });

  useLayoutEffect(() => {
    const card = ref.current;
    if (!card || reduceMotion) return;
    if (card.getBoundingClientRect().top >= window.innerHeight) setProgress(0);
  }, [reduceMotion]);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    // Quantized to the typing steps: the card renders once per key.
    if (!reduceMotion) setProgress(typedStep(value) / 4);
  });

  const step = typedStep(progress);
  const pressed = typedKey(progress);
  const saved = step === 3;

  return (
    <div ref={ref}>
      <DemoCard className="gap-4">
        <div className="flex flex-col items-center gap-1 pt-1">
          <DemoLabel>Despesa</DemoLabel>
          <p className="text-display tabular-nums text-fg">
            {typedAmount(progress)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {KEYS.map((key) => (
            <span
              key={key}
              className="relative flex h-10 items-center justify-center overflow-hidden rounded-chip bg-surface-2 text-headline text-fg"
            >
              {key === pressed && !saved ? (
                <motion.span
                  key={step}
                  className="absolute inset-0 bg-primary-soft"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: HOME_REVEAL_MS / 1000 }}
                />
              ) : null}
              <span className="relative">
                {key === "⌫" ? <Delete className="size-5 text-fg-2" /> : key}
              </span>
            </span>
          ))}
        </div>
        <motion.p
          initial={false}
          animate={
            saved ? { opacity: 1, y: 0 } : { opacity: 0, y: HOME_TOAST_RISE_PX }
          }
          transition={{ duration: HOME_TOAST_MS / 1000, ease: EASE_ENTER }}
          className="absolute inset-x-2.5 bottom-3 flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-control bg-(--toast-bg) px-3.5 py-2 text-callout font-semibold text-(--toast-fg) shadow-dialog"
        >
          <span className="min-w-0 break-words">
            Despesa de {formatBRL(DEMO.entry)} salva
          </span>
          <span className="shrink-0 font-bold text-(--toast-action)">
            Desfazer
          </span>
        </motion.p>
      </DemoCard>
    </div>
  );
}
