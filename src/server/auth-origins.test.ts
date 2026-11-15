import { describe, expect, it } from "vitest";
import { resolveAuthOrigins } from "./auth-origins";

describe("resolveAuthOrigins", () => {
  it("falls back to localhost without any input", () => {
    expect(resolveAuthOrigins({})).toEqual({
      origin: "http://localhost:3000",
      rpId: "localhost",
      passkeyOrigins: ["http://localhost:3000"],
      trustedOrigins: [],
    });
  });

  it("prefers BETTER_AUTH_URL and normalizes slash, path and case", () => {
    const result = resolveAuthOrigins({
      baseUrl: "https://App.Exemplo.com/algo/",
      vercelProductionUrl: "outro.vercel.app",
    });
    expect(result.origin).toBe("https://app.exemplo.com");
    expect(result.rpId).toBe("app.exemplo.com");
  });

  it("uses the Vercel production host when there is no base URL", () => {
    expect(
      resolveAuthOrigins({ vercelProductionUrl: "meu.vercel.app" }).origin,
    ).toBe("https://meu.vercel.app");
  });

  it("keeps only trusted origins inside the rpID for passkeys", () => {
    const result = resolveAuthOrigins({
      baseUrl: "https://exemplo.com",
      rpId: "exemplo.com",
      trusted:
        " https://www.exemplo.com , https://outro.com/x ,https://exemplo.com",
    });
    expect(result.trustedOrigins).toEqual([
      "https://www.exemplo.com",
      "https://outro.com",
    ]);
    expect(result.passkeyOrigins).toEqual([
      "https://exemplo.com",
      "https://www.exemplo.com",
    ]);
  });

  it("drops wildcards and junk from trusted origins", () => {
    const result = resolveAuthOrigins({
      trusted: "https://*.exemplo.com,nada,ftp://x.com,https://ok.com",
    });
    expect(result.trustedOrigins).toEqual(["https://ok.com"]);
  });

  it("does not match a suffix that is not a subdomain", () => {
    const result = resolveAuthOrigins({
      baseUrl: "https://exemplo.com",
      trusted: "https://malexemplo.com",
    });
    expect(result.passkeyOrigins).toEqual(["https://exemplo.com"]);
  });
});
