import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GOOGLE_ENV_WARNING, socialProvidersFromEnv } from "./auth-social";

const CLIENT_ID = "123-abc.apps.googleusercontent.com";
const SECRET = "segredo-falso-do-google-para-testes";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("socialProvidersFromEnv", () => {
  it("turns Google on with both variables, without sign-up or ID tokens", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", SECRET);
    const { providers, enabled } = socialProvidersFromEnv();
    expect(enabled).toEqual(["google"]);
    expect(providers.google).toMatchObject({
      clientId: CLIENT_ID,
      disableSignUp: true,
      disableImplicitSignUp: true,
      disableIdTokenSignIn: true,
      prompt: "select_account",
    });
  });

  it("stays off, with a warning, with one variable or an invalid one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
    expect(socialProvidersFromEnv()).toEqual({ providers: {}, enabled: [] });
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "curto");
    expect(socialProvidersFromEnv().enabled).toEqual([]);
    expect(warn).toHaveBeenCalledWith(GOOGLE_ENV_WARNING);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("curto");
  });

  it("stays off silently with neither", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(socialProvidersFromEnv()).toEqual({ providers: {}, enabled: [] });
    expect(warn).not.toHaveBeenCalled();
  });
});
