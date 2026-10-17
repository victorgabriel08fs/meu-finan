import type { TipSide } from "./types";

/**
 * Where the tip balloon goes, in viewport pixels. Pure geometry, so the
 * browser part only measures: the anchor, the balloon and the usable area
 * (the viewport without the tab bar and the collapsed page header).
 */

export type Box = { left: number; top: number; width: number; height: number };

export type PlacementInput = {
  /** The part of the anchor on screen. */
  anchor: Box;
  bubble: { width: number; height: number };
  /** Usable area of the viewport. */
  bounds: Box;
  /** From the anchor's edge to the balloon's (room for the arrow). */
  gap: number;
  /** Least distance from the balloon to the edges of `bounds`. */
  margin: number;
  /** Least distance from the arrow's centre to a corner of the balloon. */
  arrowInset: number;
  /** Sides to try, in order. */
  sides?: readonly TipSide[];
};

export type Placement = {
  /** Side of the anchor the balloon sits on. */
  side: TipSide;
  left: number;
  top: number;
  /**
   * Centre of the arrow along the edge that faces the anchor: from the
   * balloon's left (top/bottom) or top (left/right).
   */
  arrow: number;
  /** False when no side had room: the balloon is kept on screen anyway. */
  fits: boolean;
};

export const DEFAULT_SIDES: readonly TipSide[] = [
  "bottom",
  "top",
  "right",
  "left",
];

const ALL_SIDES: readonly TipSide[] = DEFAULT_SIDES;

/** `value` within [min, max]; `min` wins when the range is empty. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

const isVertical = (side: TipSide) => side === "top" || side === "bottom";

/** Room left on a side once the balloon is in (negative: it does not fit). */
function room(input: PlacementInput, side: TipSide): number {
  const { anchor: a, bubble, bounds: b, gap, margin } = input;
  const needed = isVertical(side) ? bubble.height : bubble.width;
  const across = isVertical(side)
    ? b.width - 2 * margin - bubble.width
    : b.height - 2 * margin - bubble.height;
  const along = {
    top: a.top - gap - (b.top + margin),
    bottom: b.top + b.height - margin - (a.top + a.height + gap),
    left: a.left - gap - (b.left + margin),
    right: b.left + b.width - margin - (a.left + a.width + gap),
  }[side];
  return Math.min(along - needed, across);
}

function place(input: PlacementInput, side: TipSide, fits: boolean): Placement {
  const { anchor: a, bubble, bounds: b, gap, margin, arrowInset } = input;
  if (isVertical(side)) {
    const centre = a.left + a.width / 2;
    const left = clamp(
      centre - bubble.width / 2,
      b.left + margin,
      b.left + b.width - margin - bubble.width,
    );
    let top =
      side === "top" ? a.top - gap - bubble.height : a.top + a.height + gap;
    if (!fits) {
      top = clamp(
        top,
        b.top + margin,
        b.top + b.height - margin - bubble.height,
      );
    }
    return {
      side,
      left,
      top,
      arrow: clamp(centre - left, arrowInset, bubble.width - arrowInset),
      fits,
    };
  }
  const centre = a.top + a.height / 2;
  const top = clamp(
    centre - bubble.height / 2,
    b.top + margin,
    b.top + b.height - margin - bubble.height,
  );
  let left =
    side === "left" ? a.left - gap - bubble.width : a.left + a.width + gap;
  if (!fits) {
    left = clamp(
      left,
      b.left + margin,
      b.left + b.width - margin - bubble.width,
    );
  }
  return {
    side,
    left,
    top,
    arrow: clamp(centre - top, arrowInset, bubble.height - arrowInset),
    fits,
  };
}

/**
 * The first preferred side with room for the whole balloon, centred on the
 * anchor and slid along the edge to stay inside the bounds; the arrow keeps
 * pointing at the anchor's centre. Sides left out of `sides` are tried after
 * it. With no room anywhere, the side with the most room, kept on screen.
 */
export function placeBubble(input: PlacementInput): Placement {
  const preferred = input.sides ?? DEFAULT_SIDES;
  const order = [
    ...preferred,
    ...ALL_SIDES.filter((side) => !preferred.includes(side)),
  ];
  for (const side of order) {
    if (room(input, side) >= 0) return place(input, side, true);
  }
  let best = order[0] ?? "bottom";
  for (const side of order) {
    if (room(input, side) > room(input, best)) best = side;
  }
  return place(input, best, false);
}

/** Intersection of two boxes, or null when they do not overlap. */
export function intersect(a: Box, b: Box): Box | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/** The box grown by `by` on every side. */
export function inflate(box: Box, by: number): Box {
  return {
    left: box.left - by,
    top: box.top - by,
    width: box.width + 2 * by,
    height: box.height + 2 * by,
  };
}

/**
 * SVG path of a rounded rectangle (clockwise), with the radius capped at half
 * the shorter side. Combined with an outer rectangle and `evenodd`, it cuts
 * the spotlight's hole.
 */
export function roundedRectPath(box: Box, radius: number): string {
  const r = clamp(radius, 0, Math.min(box.width, box.height) / 2);
  const { left: x, top: y, width: w, height: h } = box;
  const n = (value: number) => Math.round(value * 100) / 100;
  return [
    `M${n(x + r)} ${n(y)}`,
    `H${n(x + w - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}`,
    `V${n(y + h - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}`,
    `H${n(x + r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}`,
    `V${n(y + r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}`,
    "Z",
  ].join(" ");
}
