"use client";

import { motion } from "motion/react";
import { BrandMark } from "@/components/brand/brand-mark";
import { DemoCard } from "./home-section";
import { HOME_ICON_MS, HOME_ICON_SCALE } from "./motion";
import { entranceTransition, useEntrance } from "./use-entrance";

const SLOTS = 8;
/** Where the app sits among the neutral icons (second row). */
const APP_SLOT = 5;

/**
 * Section 6: the app's icon on a home screen of neutral icons; it comes in
 * with a fade and a 0.9 → 1 scale (360ms). At rest: the icon, still.
 */
export function DemoInstall() {
  const { ref, entrance } = useEntrance<HTMLDivElement>({ amount: 0.6 });

  return (
    <div ref={ref}>
      <DemoCard>
        <div className="grid grid-cols-4 gap-x-4 gap-y-5">
          {Array.from({ length: SLOTS }, (_, slot) =>
            slot === APP_SLOT ? (
              <motion.div
                key="app"
                initial={false}
                animate={
                  entrance === "armed"
                    ? { opacity: 0, scale: HOME_ICON_SCALE }
                    : { opacity: 1, scale: 1 }
                }
                transition={entranceTransition(entrance, HOME_ICON_MS, 0.2)}
                className="flex flex-col items-center gap-1.5"
              >
                <BrandMark className="aspect-square size-auto w-full" />
                <span className="text-micro text-fg [overflow-wrap:normal]">
                  Prumo
                </span>
              </motion.div>
            ) : (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders
                key={slot}
                className="flex flex-col items-center gap-1.5"
              >
                <span className="aspect-square w-full rounded-[28%] bg-surface-2" />
                <span className="my-[0.1875rem] h-2 w-3/5 rounded-full bg-surface-2" />
              </div>
            ),
          )}
        </div>
      </DemoCard>
    </div>
  );
}
