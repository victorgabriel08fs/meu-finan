import { describe, expect, it } from "vitest";
import { classifyAuthOutcome, rateLimitedPath } from "./auth-events";

describe("classifyAuthOutcome", () => {
  it("password and passkey sign-ins", () => {
    expect(
      classifyAuthOutcome({ path: "/sign-in/email", sessionUserId: "u1" }),
    ).toEqual({ event: "auth.sign_in", method: "password", userId: "u1" });
    expect(
      classifyAuthOutcome({
        path: "/passkey/verify-authentication",
        sessionUserId: "u2",
      }),
    ).toEqual({ event: "auth.sign_in", method: "passkey", userId: "u2" });
  });

  it("failures carry status and code", () => {
    expect(
      classifyAuthOutcome({
        path: "/sign-in/email",
        error: { status: 401, code: "INVALID_EMAIL_OR_PASSWORD" },
      }),
    ).toEqual({
      event: "auth.sign_in_failed",
      method: "password",
      status: 401,
      code: "INVALID_EMAIL_OR_PASSWORD",
    });
    expect(
      classifyAuthOutcome({
        path: "/sign-in/email",
        error: { status: 403, code: "BANNED_USER" },
      })?.code,
    ).toBe("BANNED_USER");
  });

  it("password change", () => {
    expect(
      classifyAuthOutcome({ path: "/change-password", sessionUserId: "u1" })
        ?.event,
    ).toBe("auth.password_changed");
    expect(
      classifyAuthOutcome({
        path: "/change-password",
        error: { status: 400 },
      })?.event,
    ).toBe("auth.password_change_failed");
  });

  it("ignores other paths and sign-ins without a session", () => {
    expect(classifyAuthOutcome({ path: "/get-session" })).toBeNull();
    expect(classifyAuthOutcome({ path: "/sign-in/email" })).toBeNull();
  });
});

describe("rateLimitedPath", () => {
  it("strips the prefix and maps unknown paths to other", () => {
    expect(rateLimitedPath("/api/auth/sign-in/email")).toBe("/sign-in/email");
    expect(rateLimitedPath("/api/auth/get-session")).toBe("other");
  });
});
