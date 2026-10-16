/**
 * Pure geometry for the hand-drawn charts (doc 02 §9): nice axis ticks, linear
 * scales and SVG paths. Charts draw in a 1000 × 1000 viewBox stretched with
 * `preserveAspectRatio="none"` (lines keep 2px with `non-scaling-stroke`), and
 * place dots and labels in HTML at the same percentages, so nothing needs to
 * measure the container.
 */

/** Size of the square viewBox the charts draw in. */
export const VIEWBOX = 1000;

/** 1, 2, 2.5 or 5 × 10^k: the step that splits `span` into about `count` intervals. */
export function niceStep(span: number, count: number): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const raw = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  let nice = 10;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 2.5) nice = 2.5;
  else if (normalized <= 5) nice = 5;
  return nice * magnitude;
}

/** The next nice step above `step` (1 → 2 → 2.5 → 5 → 10 …). */
function nextNiceStep(step: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(step) + 1e-9);
  const normalized = Math.round((step / magnitude) * 100) / 100;
  if (normalized < 2) return 2 * magnitude;
  if (normalized < 2.5) return 2.5 * magnitude;
  if (normalized < 5) return 5 * magnitude;
  return 10 * magnitude;
}

const clean = (value: number) => Number(value.toPrecision(12));

export type Ticks = {
  min: number;
  max: number;
  step: number;
  /** From `min` to `max`, both included. */
  values: number[];
};

/**
 * Value-axis ticks that always include zero (columns and areas grow from a
 * baseline): from min(0, low) to max(0, high) in nice steps, with at most
 * `maxIntervals` intervals (doc 02 §9.2: no more than 4 gridlines).
 */
export function niceTicks(low: number, high: number, maxIntervals = 4): Ticks {
  const lo = Math.min(0, Number.isFinite(low) ? low : 0);
  let hi = Math.max(0, Number.isFinite(high) ? high : 0);
  if (hi === lo) hi = lo + 1;
  const intervals = Math.max(1, Math.floor(maxIntervals));
  let step = niceStep(hi - lo, intervals);
  let min = clean(Math.floor(lo / step) * step);
  let max = clean(Math.ceil(hi / step) * step);
  // Rounding both ends out can add an interval; widen the step until it fits.
  for (let guard = 0; Math.round((max - min) / step) > intervals; guard++) {
    if (guard > 20) break;
    step = nextNiceStep(step);
    min = clean(Math.floor(lo / step) * step);
    max = clean(Math.ceil(hi / step) * step);
  }
  const count = Math.round((max - min) / step);
  const values = Array.from({ length: count + 1 }, (_, k) =>
    clean(min + k * step),
  );
  return { min, max, step, values };
}

/** Linear map from a domain to a range; a flat domain maps to the range start. */
export function scaleLinear(
  domain: readonly [number, number],
  range: readonly [number, number],
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return (value: number) =>
    span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0);
}

/** Percentage from the top of the plot for `value` on `ticks` (0 = top, 100 = base). */
export function topPercent(value: number, ticks: Pick<Ticks, "min" | "max">) {
  return scaleLinear([ticks.min, ticks.max], [100, 0])(value);
}

/** Share of `value` in `max`, clamped to 0–100 (bar widths and heights). */
export function percentOf(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

export type Point = readonly [x: number, y: number];

const coord = (value: number) => String(Math.round(value * 100) / 100);

/**
 * Polyline as an SVG path; `null` points break the line (a month without data
 * leaves a gap instead of a misleading slope).
 */
export function linePath(points: ReadonlyArray<Point | null>): string {
  const parts: string[] = [];
  let drawing = false;
  for (const point of points) {
    if (!point) {
      drawing = false;
      continue;
    }
    parts.push(`${drawing ? "L" : "M"}${coord(point[0])} ${coord(point[1])}`);
    drawing = true;
  }
  return parts.join(" ");
}

/** Closed area between an upper and a lower line with the same x positions. */
export function areaPath(
  upper: readonly Point[],
  lower: readonly Point[],
): string {
  if (upper.length === 0 || lower.length === 0) return "";
  const forward = upper.map(
    ([x, y], index) => `${index === 0 ? "M" : "L"}${coord(x)} ${coord(y)}`,
  );
  const back = [...lower].reverse().map(([x, y]) => `L${coord(x)} ${coord(y)}`);
  return `${[...forward, ...back].join(" ")} Z`;
}

/** Index of the stop nearest to a 0–1 position along the x axis. */
export function nearestIndex(
  ratio: number,
  positions: readonly number[],
): number {
  if (positions.length === 0) return 0;
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  positions.forEach((position, index) => {
    const gap = Math.abs(position - ratio);
    if (gap < distance) {
      distance = gap;
      best = index;
    }
  });
  return best;
}

/**
 * Horizontal anchor for a direct label at `percent` of the width, so labels
 * near the edges grow inwards instead of overflowing the card.
 */
export function labelAnchor(percent: number): "start" | "middle" | "end" {
  if (percent < 15) return "start";
  if (percent > 85) return "end";
  return "middle";
}
