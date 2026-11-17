import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pwnedCount } from "./pwned-range";

const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

describe("pwnedCount", () => {
  it("finds the suffix in any case, with LF or CRLF", () => {
    const lines = [
      "0018A45C4D1DEF81644B54AB7F969B88D65:1",
      `${SUFFIX}:3861493`,
    ];
    expect(pwnedCount(lines.join("\n"), SUFFIX)).toBe(3861493);
    expect(pwnedCount(lines.join("\r\n"), SUFFIX.toLowerCase())).toBe(3861493);
    expect(pwnedCount(lines.join("\r\n").toLowerCase(), SUFFIX)).toBe(3861493);
  });
  it("is 0 when the suffix is absent", () => {
    expect(pwnedCount("0018A45C4D1DEF81644B54AB7F969B88D65:1", SUFFIX)).toBe(0);
    expect(pwnedCount("", SUFFIX)).toBe(0);
  });
  it("is 0 for padding lines and malformed counts", () => {
    expect(pwnedCount(`${SUFFIX}:0`, SUFFIX)).toBe(0);
    expect(pwnedCount(`${SUFFIX}:abc`, SUFFIX)).toBe(0);
    expect(pwnedCount(`${SUFFIX}:`, SUFFIX)).toBe(0);
    expect(pwnedCount(`${SUFFIX}`, SUFFIX)).toBe(0);
  });
  it("is 0 for an empty suffix", () => {
    expect(pwnedCount("A:5", "")).toBe(0);
  });
  it("is 0 for any body without the suffix", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.stringMatching(/^[0-9A-F]{35}$/),
            fc.nat({ max: 1_000_000 }),
          ),
        ),
        (rows) => {
          const body = rows
            .filter(([s]) => s !== SUFFIX)
            .map(([s, n]) => `${s}:${n}`)
            .join("\r\n");
          expect(pwnedCount(body, SUFFIX)).toBe(0);
        },
      ),
    );
  });
});
