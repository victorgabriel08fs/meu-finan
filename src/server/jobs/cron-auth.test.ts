import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "./cron-auth";

const SECRET = "s3cr3t-0123456789-abcdefghijklmnopqrstuv";

describe("isAuthorizedCronRequest", () => {
  it("accepts the exact bearer token", () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("accepts a case-insensitive scheme and surrounding whitespace", () => {
    expect(isAuthorizedCronRequest(`bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorizedCronRequest(`  Bearer   ${SECRET}  `, SECRET)).toBe(
      true,
    );
  });

  it("fails closed when the secret is not configured", () => {
    for (const secret of [undefined, null, ""]) {
      expect(isAuthorizedCronRequest("Bearer undefined", secret)).toBe(false);
      expect(isAuthorizedCronRequest("Bearer null", secret)).toBe(false);
      expect(isAuthorizedCronRequest("Bearer ", secret)).toBe(false);
      expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, secret)).toBe(false);
    }
  });

  it("rejects a missing or empty header", () => {
    expect(isAuthorizedCronRequest(null, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(undefined, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest("", SECRET)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer", SECRET)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer    ", SECRET)).toBe(false);
  });

  it("rejects a wrong token, including prefixes and suffixes of the secret", () => {
    expect(isAuthorizedCronRequest("Bearer wrong", SECRET)).toBe(false);
    expect(
      isAuthorizedCronRequest(`Bearer ${SECRET.slice(0, -1)}`, SECRET),
    ).toBe(false);
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(
      isAuthorizedCronRequest(`Bearer ${SECRET.toUpperCase()}`, SECRET),
    ).toBe(false);
  });

  it("rejects other schemes and a bare secret", () => {
    expect(isAuthorizedCronRequest(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(`Basic ${SECRET}`, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(`Token ${SECRET}`, SECRET)).toBe(false);
  });

  it("compares non-ASCII secrets byte for byte", () => {
    const unicode = "çãõ-ñ-🔐-segredo-com-acentos-1234567890";
    expect(isAuthorizedCronRequest(`Bearer ${unicode}`, unicode)).toBe(true);
    expect(
      isAuthorizedCronRequest(`Bearer ${unicode.normalize("NFD")}`, unicode),
    ).toBe(false);
  });
});
