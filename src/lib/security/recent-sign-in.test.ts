import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isRecentSignIn, RECENT_SIGN_IN_MINUTES } from "./recent-sign-in";

const NOW = new Date("2026-11-17T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MINUTE = 60_000;

describe("isRecentSignIn", () => {
  it("counts a sign-in up to 15 minutes old, inclusive", () => {
    expect(RECENT_SIGN_IN_MINUTES).toBe(15);
    expect(isRecentSignIn(ago(0), NOW)).toBe(true);
    expect(isRecentSignIn(ago(15 * MINUTE), NOW)).toBe(true);
    expect(isRecentSignIn(ago(15 * MINUTE + 1), NOW)).toBe(false);
    expect(isRecentSignIn(ago(24 * 60 * MINUTE), NOW)).toBe(false);
  });

  it("tolerates a minute of clock skew into the future, not more", () => {
    expect(isRecentSignIn(ago(-MINUTE), NOW)).toBe(true);
    expect(isRecentSignIn(ago(-MINUTE - 1), NOW)).toBe(false);
  });

  it("takes another window and refuses an invalid date", () => {
    expect(isRecentSignIn(ago(30 * MINUTE), NOW, 60)).toBe(true);
    expect(isRecentSignIn(new Date(Number.NaN), NOW)).toBe(false);
  });

  it("never becomes recent again as time passes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -2 * MINUTE, max: 60 * MINUTE }),
        fc.integer({ min: 0, max: 60 * MINUTE }),
        (age, later) => {
          const signedInAt = ago(age);
          const after = new Date(NOW.getTime() + later);
          if (!isRecentSignIn(signedInAt, NOW) && age > 0) {
            expect(isRecentSignIn(signedInAt, after)).toBe(false);
          }
        },
      ),
    );
  });
});
