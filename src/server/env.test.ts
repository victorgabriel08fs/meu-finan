import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MIN_TOKEN_LENGTH } from "@/proxy";
import { authOrigins, MIN_SECRET_LENGTH, readServerEnvSafe } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("readServerEnvSafe", () => {
  it("reports unset, ok and invalid without echoing the value", () => {
    expect(readServerEnvSafe("RECOVERY_TOKEN")).toEqual({ status: "unset" });
    vi.stubEnv("RECOVERY_TOKEN", "curto-segredo");
    const bad = readServerEnvSafe("RECOVERY_TOKEN");
    expect(bad.status).toBe("invalid");
    expect(JSON.stringify(bad)).not.toContain("curto-segredo");
    vi.stubEnv("RECOVERY_TOKEN", "x".repeat(32));
    expect(readServerEnvSafe("RECOVERY_TOKEN").status).toBe("ok");
  });

  it("reads PRIVACY_CONTACT_EMAIL as a lower-case e-mail", () => {
    expect(readServerEnvSafe("PRIVACY_CONTACT_EMAIL").status).toBe("unset");
    vi.stubEnv("PRIVACY_CONTACT_EMAIL", "Contato@Exemplo.com");
    expect(readServerEnvSafe("PRIVACY_CONTACT_EMAIL")).toEqual({
      status: "ok",
      value: "contato@exemplo.com",
    });
    vi.stubEnv("PRIVACY_CONTACT_EMAIL", "sem-arroba");
    const bad = readServerEnvSafe("PRIVACY_CONTACT_EMAIL");
    expect(bad.status).toBe("invalid");
    expect(JSON.stringify(bad)).not.toContain("sem-arroba");
  });

  it("matches the proxy's minimum token length", () => {
    expect(MIN_TOKEN_LENGTH).toBe(MIN_SECRET_LENGTH);
  });
});

describe("authOrigins", () => {
  it("uses the Vercel host only in production", () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "meu.vercel.app");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(authOrigins().origin).toBe("http://localhost:3000");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(authOrigins().origin).toBe("https://meu.vercel.app");
  });

  it("ignores an invalid PASSKEY_RP_ID instead of throwing", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://exemplo.com");
    vi.stubEnv("PASSKEY_RP_ID", "https://exemplo.com/x");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(authOrigins().rpId).toBe("exemplo.com");
  });
});
