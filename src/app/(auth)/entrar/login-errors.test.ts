import { describe, expect, it } from "vitest";
import {
  isPasskeyCancel,
  loginErrorMessage,
  SIGN_IN_UNAVAILABLE,
  WRONG_CREDENTIALS,
} from "./login-errors";

describe("loginErrorMessage", () => {
  it("has no message without an error", () => {
    expect(loginErrorMessage(null)).toBeNull();
  });
  it("says wrong credentials only for 401 or the credentials code", () => {
    expect(loginErrorMessage({ status: 401 })).toBe(WRONG_CREDENTIALS);
    expect(
      loginErrorMessage({ status: 400, code: "INVALID_EMAIL_OR_PASSWORD" }),
    ).toBe(WRONG_CREDENTIALS);
  });
  it("handles rate limit and deactivated accounts", () => {
    expect(loginErrorMessage({ status: 429 })).toMatch(/Muitas tentativas/);
    expect(loginErrorMessage({ status: 403, code: "BANNED_USER" })).toMatch(
      /desativ/i,
    );
  });
  it("shows the per-e-mail lock with the wait from the server", () => {
    const message = loginErrorMessage({
      status: 429,
      code: "LOGIN_LOCKED",
      retryAfter: 600,
    });
    expect(message).toMatch(/este e-mail/);
    expect(message).toContain("10 min");
    expect(message).toContain("passkey");
  });
  it("does not blame the password for origin, server or network failures", () => {
    expect(loginErrorMessage({ status: 403, code: "INVALID_ORIGIN" })).toBe(
      SIGN_IN_UNAVAILABLE,
    );
    expect(loginErrorMessage({ status: 500 })).toBe(SIGN_IN_UNAVAILABLE);
    expect(loginErrorMessage({})).toBe(SIGN_IN_UNAVAILABLE);
  });
});

describe("isPasskeyCancel", () => {
  it("recognizes a dismissed prompt", () => {
    expect(isPasskeyCancel({ name: "NotAllowedError" })).toBe(true);
    expect(isPasskeyCancel({ name: "AbortError" })).toBe(true);
    expect(isPasskeyCancel({ name: "TypeError" })).toBe(false);
  });
});
