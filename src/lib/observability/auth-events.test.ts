import { describe, expect, it } from "vitest";
import {
  classifyAuthOutcome,
  classifySocialOutcome,
  RATE_LIMITED_PATHS,
  rateLimitedPath,
} from "./auth-events";

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

describe("classifySocialOutcome", () => {
  const callback = { path: "/callback/:id", provider: "google" };

  it("a redirect with an error is a failed sign-in", () => {
    expect(
      classifySocialOutcome({
        ...callback,
        redirectLocation: "http://localhost:3000/entrar?error=signup_disabled",
      }),
    ).toEqual({
      event: "auth.sign_in_failed",
      method: "google",
      code: "signup_disabled",
    });
  });

  it("a new session is a sign-in; a bare redirect ends a link", () => {
    expect(
      classifySocialOutcome({
        ...callback,
        sessionUserId: "u1",
        redirectLocation: "/inicio",
      }),
    ).toEqual({ event: "auth.sign_in", method: "google", userId: "u1" });
    expect(
      classifySocialOutcome({
        ...callback,
        redirectLocation: "/ajustes/seguranca?vinculado=google",
      })?.event,
    ).toBe("auth.social_linked");
  });

  it("unlinking, and paths that are not Google's", () => {
    expect(
      classifySocialOutcome({ path: "/unlink-account", sessionUserId: "u1" }),
    ).toEqual({
      event: "auth.social_unlinked",
      method: "google",
      userId: "u1",
    });
    expect(
      classifySocialOutcome({
        path: "/unlink-account",
        sessionUserId: "u1",
        error: { status: 400 },
      }),
    ).toBeNull();
    expect(classifySocialOutcome({ path: "/get-session" })).toBeNull();
    expect(
      classifySocialOutcome({ path: "/callback/:id", provider: "github" }),
    ).toBeNull();
  });
});

describe("rate-limited paths", () => {
  it("groups every OAuth callback", () => {
    expect(rateLimitedPath("/api/auth/callback/google")).toBe("/callback/*");
    expect(rateLimitedPath("/api/auth/sign-in/social")).toBe("/sign-in/social");
  });

  it("match the custom rules of src/server/auth.ts", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/server/auth.ts", "utf8");
    const rules = source.slice(source.indexOf("customRules: {"));
    const block = rules.slice(0, rules.indexOf("},\n    },"));
    const keys = [...block.matchAll(/"([^"]+)": \{ window/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual([...RATE_LIMITED_PATHS].sort());
  });
});
