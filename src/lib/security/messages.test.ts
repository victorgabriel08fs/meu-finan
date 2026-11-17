import { describe, expect, it } from "vitest";
import { loginLockedMessage } from "./messages";

describe("loginLockedMessage", () => {
  it("says seconds below a minute and minutes (rounded up) after", () => {
    expect(loginLockedMessage(40)).toContain("40 s");
    expect(loginLockedMessage(60)).toContain("1 min");
    expect(loginLockedMessage(61)).toContain("2 min");
    expect(loginLockedMessage(900)).toContain("15 min");
  });
  it("mentions the passkey", () => {
    expect(loginLockedMessage(40)).toContain("passkey");
  });
  it("has no number without a valid wait", () => {
    for (const value of [
      undefined,
      Number.NaN,
      0,
      -5,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(loginLockedMessage(value)).toBe(
        "Muitas tentativas com este e-mail. Espere alguns minutos ou entre com a passkey.",
      );
    }
  });
});
