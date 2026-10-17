import { describe, expect, it } from "vitest";
import {
  ACCESS_LINK_TTL_MS,
  accessLinkExpiry,
  accessLinkUrl,
  createAccessToken,
  hashVerifier,
  parseAccessToken,
  verifierMatches,
} from "./access-token";

describe("createAccessToken", () => {
  it("makes a selector and a 32-byte verifier, and keeps only its hash", () => {
    const { token, selector, verifierHash } = createAccessToken();
    const parsed = parseAccessToken(token);
    expect(parsed?.selector).toBe(selector);
    expect(parsed?.verifier).toHaveLength(43);
    expect(Buffer.from(parsed?.verifier ?? "", "base64url")).toHaveLength(32);
    expect(verifierHash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifierHash).toBe(hashVerifier(parsed?.verifier ?? ""));
    expect(token).not.toContain(verifierHash);
  });

  it("never repeats", () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => createAccessToken().token),
    );
    expect(tokens.size).toBe(200);
  });
});

describe("parseAccessToken", () => {
  const { token } = createAccessToken();

  it("accepts a well-formed token", () => {
    expect(parseAccessToken(token)).not.toBeNull();
  });

  it.each([
    null,
    undefined,
    "",
    "abc",
    token.replace(".", ""),
    `${token}x`,
    `x${token}`,
    token.replace(".", ".."),
    `${token.slice(0, 16)}.${"a".repeat(42)}=`,
    `${token.slice(0, 16)}.${"a".repeat(42)}%`,
    `../${token}`,
  ])("rejects %j", (input) => {
    expect(parseAccessToken(input)).toBeNull();
  });
});

describe("verifierMatches", () => {
  const { token, verifierHash } = createAccessToken();
  const verifier = parseAccessToken(token)?.verifier ?? "";

  it("accepts the right verifier", () => {
    expect(verifierMatches(verifier, verifierHash)).toBe(true);
  });

  it("rejects any other verifier, and a malformed hash", () => {
    const other = parseAccessToken(createAccessToken().token)?.verifier ?? "";
    expect(verifierMatches(other, verifierHash)).toBe(false);
    expect(verifierMatches(`${verifier.slice(0, -1)}A`, verifierHash)).toBe(
      verifier.endsWith("A"),
    );
    expect(verifierMatches(verifier, "")).toBe(false);
    expect(verifierMatches(verifier, verifierHash.slice(2))).toBe(false);
    expect(verifierMatches(verifier, "zz".repeat(32))).toBe(false);
  });
});

describe("links", () => {
  it("expire in 72 hours", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    expect(accessLinkExpiry(now).getTime() - now.getTime()).toBe(
      ACCESS_LINK_TTL_MS,
    );
    expect(accessLinkExpiry(now).toISOString()).toBe(
      "2026-10-20T12:00:00.000Z",
    );
  });

  it("point at /convite on the app's origin", () => {
    expect(accessLinkUrl("https://app.exemplo.com", "abc.def")).toBe(
      "https://app.exemplo.com/convite/abc.def",
    );
    expect(accessLinkUrl("http://localhost:3201/", "abc.def")).toBe(
      "http://localhost:3201/convite/abc.def",
    );
  });
});
