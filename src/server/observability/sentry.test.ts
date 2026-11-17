import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({
  waitUntil: (promise: Promise<unknown>) => void promise,
}));

const captureException = vi.fn();
const captureMessage = vi.fn();
const flush = vi.fn(async () => true);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("server Sentry helpers", () => {
  it("do not load the SDK without SENTRY_DSN", async () => {
    vi.doMock("@sentry/nextjs", () => {
      throw new Error("não deveria carregar");
    });
    const mod = await import("./sentry");
    expect(mod.sentrySdk()).toBeNull();
    expect(() =>
      mod.captureServerError(new Error("x"), { a: "b" }),
    ).not.toThrow();
    expect(() => mod.captureServerMessage("m", "warning")).not.toThrow();
    vi.doUnmock("@sentry/nextjs");
  });

  it("send with tags and flush when the DSN is valid", async () => {
    vi.stubEnv("SENTRY_DSN", "https://abc@o1.ingest.us.sentry.io/1");
    vi.doMock("@sentry/nextjs", () => ({
      captureException,
      captureMessage,
      flush,
    }));
    const mod = await import("./sentry");
    const error = new Error("boom");
    mod.captureServerError(error, { kind: "action" });
    mod.captureServerMessage("auth.rate_limited", "warning", { path: "/p" });
    await vi.waitFor(() => expect(flush).toHaveBeenCalledTimes(2));
    expect(captureException).toHaveBeenCalledWith(error, {
      tags: { kind: "action" },
    });
    expect(captureMessage).toHaveBeenCalledWith("auth.rate_limited", {
      level: "warning",
      tags: { path: "/p" },
      fingerprint: ["auth.rate_limited", "/p"],
    });
    vi.doUnmock("@sentry/nextjs");
  });
});
