import { formatBRL } from "@/lib/format/money";

/**
 * Pure helpers and made-up data of the public homepage (doc 02 §6.19). No
 * React, no DOM: everything here runs in the Vitest node environment.
 */

/** Example figures, in integer cents. Nobody's money: the page says so once. */
export const DEMO = {
  /** The expense typed in the keypad card. */
  entry: 6450,
  heroBalance: 482350,
  forecast: 391870,
  income: 520000,
  expense: 312450,
  upcoming: [
    { name: "Aluguel", when: "dia 5", amount: 180000 },
    { name: "Internet", when: "dia 10", amount: 11990 },
    { name: "Fatura do cartão", when: "dia 12", amount: 94260 },
  ],
  budget: { name: "Mercado", spent: 64000, limit: 80000 },
  budgetShare: 0.8,
  goal: { name: "Viagem", saved: 496000, target: 800000 },
  goalShare: 0.62,
  /** R$ 500 a month at 1% a month, one point per year, in cents. */
  curve: [
    0, 634100, 1348700, 2153800, 3061100, 4083500, 5235500, 6533600, 7996400,
    9644600, 11501900,
  ],
  /** The same deposits with no interest. */
  deposits: [
    0, 600000, 1200000, 1800000, 2400000, 3000000, 3600000, 4200000, 4800000,
    5400000, 6000000,
  ],
} as const;

/** Geometry of the wordmark's "p" on its 301×88 grid (brand/wordmark.tsx). */
export const WORDMARK_GRID = {
  height: 88,
  /** x of the stem: where the page's thread runs. */
  stemX: 16,
  /** y of the top point of the diamond weight: where the thread ends. */
  weightY: 58,
} as const;
/** Height of the hero wordmark relative to the grid (44 px). */
export const WORDMARK_HERO_SCALE = 0.5;
/** Height of the closing wordmark relative to the grid (88 px). */
export const WORDMARK_CLOSING_SCALE = 1;
/** Share of the scroll, at the end, in which the weight settles on the p. */
export const DOCK_SHARE = 0.15;

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

const CURRENCY_PREFIX = formatBRL(0).replace("0,00", "");
const TYPED_STEPS = ["6", "64", "64,50"] as const;
const TYPED_KEYS = ["6", "4", "0"] as const;

/** 0 before the first key, then 1..3: one step per quarter of the progress. */
export function typedStep(progress: number): 0 | 1 | 2 | 3 {
  return Math.min(Math.floor(clamp01(progress) * 4), 3) as 0 | 1 | 2 | 3;
}

/**
 * The amount of the keypad card being typed as the section scrolls in:
 * "R$ 0,00", "R$ 6", "R$ 64", "R$ 64,50". Monotonic; ends on the full amount.
 */
export function typedAmount(progress: number): string {
  const step = typedStep(progress);
  if (step === 0) return formatBRL(0);
  if (step === 3) return formatBRL(DEMO.entry);
  return `${CURRENCY_PREFIX}${TYPED_STEPS[step - 1]}`;
}

/** The key that was just pressed at this progress, or null before the first. */
export function typedKey(progress: number): string | null {
  const step = typedStep(progress);
  return step === 0 ? null : TYPED_KEYS[step - 1];
}

/**
 * Count from 0 to `target` (integer cents) at time `t` in 0..1, easing out
 * (cubic). Always whole cents, never past the target, exactly the target from
 * t = 1 on.
 */
export function countTo(target: number, t: number): number {
  const time = clamp01(t);
  if (time >= 1) return target;
  const eased = 1 - (1 - time) ** 3;
  return Math.trunc(target * eased);
}

/** Length of the page's thread, 0..1: the scroll progress itself. */
export function threadLength(progress: number): number {
  return clamp01(progress);
}

/**
 * How far the weight has settled on the closing wordmark, 0..1: 0 until the
 * last 15% of the scroll, 1 at the end.
 */
export function weightDocked(progress: number): number {
  return clamp01((clamp01(progress) - (1 - DOCK_SHARE)) / DOCK_SHARE);
}

/** Scale of the travelling weight: the hero's size, growing into the closing one's. */
export function weightScale(progress: number): number {
  return (
    WORDMARK_HERO_SCALE +
    (WORDMARK_CLOSING_SCALE - WORDMARK_HERO_SCALE) * weightDocked(progress)
  );
}

/** Where the thread is: on the hero's p, travelling, or settled on the closing p. */
export type ThreadState = "top" | "run" | "docked";

export function threadState(progress: number): ThreadState {
  const length = threadLength(progress);
  if (length <= 0) return "top";
  return length >= 1 ? "docked" : "run";
}

/**
 * SVG path of a series drawn across a `width`×`height` box (y grows down),
 * scaled so `max` touches the top. One decimal place, so server and client
 * print the same string.
 */
export function curvePath(
  values: readonly number[],
  width: number,
  height: number,
  max: number = Math.max(...values),
): string {
  if (values.length < 2 || max <= 0) return "";
  const step = width / (values.length - 1);
  return values
    .map((value, index) => {
      const x = (index * step).toFixed(1);
      const y = (height - clamp01(value / max) * height).toFixed(1);
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join("");
}
