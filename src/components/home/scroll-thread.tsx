"use client";

import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  type ThreadState,
  threadLength,
  threadState,
  weightScale,
} from "./model";

/** The diamond weight of the wordmark, with its top point at the origin. */
const WEIGHT_PATH = "M0 0l8.5 9.5l-8.5 12.5l-8.5 -12.5Z";

/**
 * The page's thread (doc 02 §6.19): a 2px line in --primary that runs from
 * the "p" of the hero wordmark to the "p" of the closing one, as long as the
 * scroll progress, with the wordmark's diamond at its tip. The box is placed
 * by CSS alone (`.home-thread`, from the wordmarks' geometry), so nothing is
 * measured: the line scales and the tip moves in percentages of that box.
 *
 * Server, no JavaScript and reduced motion: the whole line, still, and both
 * wordmarks complete. Otherwise the track's `data-home-thread` says where the
 * tip is, and the CSS hides the wordmark's own diamond while this one stands
 * in for it (same place, same size at both ends).
 *
 * Only `transform` changes while scrolling. Decorative.
 */
export function ScrollThread() {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const live = mounted && !reduceMotion;

  const { scrollYProgress } = useScroll();
  const scaleY = useTransform(scrollYProgress, threadLength);
  const y = useTransform(
    scrollYProgress,
    (progress) => `${(threadLength(progress) - 1) * 100}%`,
  );
  const scale = useTransform(scrollYProgress, weightScale);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const track = ref.current?.parentElement;
    if (!track || !live) return;
    track.dataset.homeThread = threadState(scrollYProgress.get());
    return () => {
      delete track.dataset.homeThread;
    };
  }, [live, scrollYProgress]);

  useMotionValueEvent(scrollYProgress, "change", (progress) => {
    const track = ref.current?.parentElement;
    if (!track || !live) return;
    const next: ThreadState = threadState(progress);
    if (track.dataset.homeThread !== next) track.dataset.homeThread = next;
  });

  return (
    <div ref={ref} aria-hidden="true" className="home-thread">
      <div className="home-thread-rail" />
      {live ? (
        <>
          <motion.div className="home-thread-line" style={{ scaleY }} />
          <motion.div className="home-thread-carrier" style={{ y }}>
            <motion.div className="home-thread-weight" style={{ scale }}>
              <svg aria-hidden="true" viewBox="-10 -1.5 20 25">
                <path
                  d={WEIGHT_PATH}
                  className="fill-primary stroke-primary"
                  strokeWidth={3}
                  strokeLinejoin="round"
                />
              </svg>
            </motion.div>
          </motion.div>
        </>
      ) : (
        <div className="home-thread-line" />
      )}
    </div>
  );
}
