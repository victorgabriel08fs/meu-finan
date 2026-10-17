import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type Box,
  clamp,
  inflate,
  intersect,
  type PlacementInput,
  placeBubble,
  roundedRectPath,
} from "./placement";

/** A 412 × 839 phone (Pixel 7) without its 64px tab bar. */
const PHONE: Box = { left: 0, top: 0, width: 412, height: 775 };
const BUBBLE = { width: 336, height: 196 };
const BASE = {
  bubble: BUBBLE,
  bounds: PHONE,
  gap: 14,
  margin: 12,
  arrowInset: 24,
};

const input = (anchor: Box, patch: Partial<PlacementInput> = {}) => ({
  ...BASE,
  anchor,
  ...patch,
});

describe("placeBubble", () => {
  it("puts the balloon above the tab bar's +, centred, arrow on the button", () => {
    // The + (52px) in the middle of the tab bar, below the usable area.
    const plus = { left: 180, top: 781, width: 52, height: 52 };
    const placement = placeBubble(input(plus, { sides: ["top"] }));
    expect(placement.side).toBe("top");
    expect(placement.fits).toBe(true);
    expect(placement.top + BUBBLE.height).toBe(plus.top - BASE.gap);
    expect(placement.left).toBe(38);
    expect(placement.left + placement.arrow).toBe(206);
  });

  it("slides along the edge for a control in a corner, the arrow follows", () => {
    // The privacy eye, top right.
    const eye = { left: 352, top: 14, width: 44, height: 44 };
    const placement = placeBubble(input(eye));
    expect(placement.side).toBe("bottom");
    expect(placement.top).toBe(eye.top + eye.height + BASE.gap);
    expect(placement.left).toBe(PHONE.width - BASE.margin - BUBBLE.width);
    expect(placement.left + placement.arrow).toBe(374);
  });

  it("flips to the other side when the preferred one has no room", () => {
    const low = { left: 20, top: 600, width: 372, height: 60 };
    expect(placeBubble(input(low)).side).toBe("top");
    const high = { left: 20, top: 40, width: 372, height: 44 };
    expect(placeBubble(input(high, { sides: ["top"] })).side).toBe("bottom");
  });

  it("goes beside an anchor in the desktop sidebar", () => {
    const desktop = { left: 0, top: 0, width: 1440, height: 900 };
    const button = { left: 16, top: 84, width: 216, height: 44 };
    const placement = placeBubble(
      input(button, { bounds: desktop, sides: ["top", "right", "bottom"] }),
    );
    expect(placement.side).toBe("right");
    expect(placement.left).toBe(button.left + button.width + BASE.gap);
    expect(placement.top).toBe(BASE.margin);
    expect(placement.top + placement.arrow).toBe(106);
  });

  it("keeps the arrow off the rounded corners", () => {
    const edge = { left: 0, top: 100, width: 8, height: 30 };
    const placement = placeBubble(input(edge, { sides: ["bottom"] }));
    expect(placement.arrow).toBe(BASE.arrowInset);
  });

  it("stays on screen when no side has room", () => {
    const huge = { left: 0, top: 0, width: 412, height: 775 };
    const placement = placeBubble(input(huge));
    expect(placement.fits).toBe(false);
    expect(placement.left).toBeGreaterThanOrEqual(BASE.margin);
    expect(placement.top).toBeGreaterThanOrEqual(BASE.margin);
    expect(placement.top + BUBBLE.height).toBeLessThanOrEqual(
      PHONE.height - BASE.margin,
    );
  });

  it("never covers the anchor and stays inside the bounds when it fits", () => {
    const box = (max: { width: number; height: number }) =>
      fc
        .record({
          left: fc.integer({ min: 0, max: max.width - 8 }),
          top: fc.integer({ min: 0, max: max.height - 8 }),
          width: fc.integer({ min: 8, max: 240 }),
          height: fc.integer({ min: 8, max: 120 }),
        })
        .filter(
          (anchor) =>
            anchor.left + anchor.width <= max.width &&
            anchor.top + anchor.height <= max.height,
        );
    const viewport = fc.constantFrom(
      { left: 0, top: 0, width: 360, height: 576 },
      PHONE,
      { left: 0, top: 0, width: 1440, height: 900 },
    );
    fc.assert(
      fc.property(
        viewport.chain((bounds) => fc.tuple(fc.constant(bounds), box(bounds))),
        fc.subarray(["top", "bottom", "left", "right"] as const, {
          minLength: 1,
        }),
        ([bounds, anchor], sides) => {
          const bubble = {
            width: Math.min(336, bounds.width - 24),
            height: 196,
          };
          const placement = placeBubble({
            ...BASE,
            bubble,
            bounds,
            anchor,
            sides,
          });
          const balloon = {
            ...bubble,
            left: placement.left,
            top: placement.top,
          };
          expect(placement.arrow).toBeGreaterThanOrEqual(BASE.arrowInset);
          expect(placement.arrow).toBeLessThanOrEqual(
            (placement.side === "top" || placement.side === "bottom"
              ? bubble.width
              : bubble.height) - BASE.arrowInset,
          );
          if (!placement.fits) return;
          expect(intersect(balloon, inflate(anchor, BASE.gap - 1))).toBeNull();
          expect(balloon.left).toBeGreaterThanOrEqual(
            bounds.left + BASE.margin,
          );
          expect(balloon.top).toBeGreaterThanOrEqual(bounds.top + BASE.margin);
          expect(balloon.left + bubble.width).toBeLessThanOrEqual(
            bounds.left + bounds.width - BASE.margin,
          );
          expect(balloon.top + bubble.height).toBeLessThanOrEqual(
            bounds.top + bounds.height - BASE.margin,
          );
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("geometry helpers", () => {
  it("clamps, intersects and inflates boxes", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(5, 8, 2)).toBe(8);
    expect(
      intersect(
        { left: 0, top: 0, width: 10, height: 10 },
        { left: 5, top: 5, width: 10, height: 10 },
      ),
    ).toEqual({ left: 5, top: 5, width: 5, height: 5 });
    expect(
      intersect(
        { left: 0, top: 0, width: 10, height: 10 },
        { left: 10, top: 0, width: 5, height: 5 },
      ),
    ).toBeNull();
    expect(inflate({ left: 10, top: 10, width: 20, height: 20 }, 4)).toEqual({
      left: 6,
      top: 6,
      width: 28,
      height: 28,
    });
  });

  it("draws a rounded rectangle with the radius capped at half the side", () => {
    expect(roundedRectPath({ left: 0, top: 0, width: 40, height: 20 }, 4)).toBe(
      "M4 0 H36 A4 4 0 0 1 40 4 V16 A4 4 0 0 1 36 20 H4 A4 4 0 0 1 0 16 V4 A4 4 0 0 1 4 0 Z",
    );
    expect(
      roundedRectPath({ left: 0, top: 0, width: 40, height: 20 }, 99),
    ).toContain("A10 10");
  });
});
