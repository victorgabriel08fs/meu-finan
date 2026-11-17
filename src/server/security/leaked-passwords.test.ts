import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isPasswordLeaked, rejectLeakedPassword } from "./leaked-passwords";

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

const respond = (body: string, status = 200) =>
  vi.fn(
    async (..._args: Parameters<typeof fetch>) =>
      new Response(body, { status }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  process.env.PASSWORD_LEAK_CHECK = "on";
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  process.env.PASSWORD_LEAK_CHECK = "off";
  vi.restoreAllMocks();
});

describe("isPasswordLeaked", () => {
  it("sends only the 5-character prefix, with padding", async () => {
    const fetcher = respond("");
    await isPasswordLeaked("password", { fetch: fetcher });
    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];
    expect(url.endsWith("/range/5BAA6")).toBe(true);
    const sent = JSON.stringify([url.split("/range/")[1], init.headers]);
    expect(sent).not.toContain("password");
    expect(sent).not.toContain(SUFFIX);
    expect((init.headers as Record<string, string>)["Add-Padding"]).toBe(
      "true",
    );
  });
  it("is true when the suffix is listed, false when it is not", async () => {
    expect(
      await isPasswordLeaked("password", {
        fetch: respond(`ABC:1\r\n${SUFFIX}:3861493\r\n`),
      }),
    ).toBe(true);
    expect(
      await isPasswordLeaked("password", { fetch: respond("ABC:1\r\n") }),
    ).toBe(false);
  });
  it("fails open on 503, network error and timeout, without logging the password", async () => {
    expect(
      await isPasswordLeaked("password", { fetch: respond("", 503) }),
    ).toBe(false);
    expect(
      await isPasswordLeaked("password", {
        fetch: (async () => {
          throw new Error("offline");
        }) as typeof fetch,
      }),
    ).toBe(false);
    expect(
      await isPasswordLeaked("password", {
        timeoutMs: 20,
        fetch: ((_url: unknown, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          })) as typeof fetch,
      }),
    ).toBe(false);
    expect(warn).toHaveBeenCalledTimes(3);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("status 503");
    expect(logged).toContain("network");
    expect(logged).toContain("timeout");
    expect(logged).not.toContain("password");
    expect(logged).not.toContain("5BAA6");
  });
  it("does not call the network when off", async () => {
    process.env.PASSWORD_LEAK_CHECK = "off";
    const fetcher = respond(`${SUFFIX}:1`);
    expect(await isPasswordLeaked("password", { fetch: fetcher })).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("warns about an invalid value and checks anyway", async () => {
    process.env.PASSWORD_LEAK_CHECK = "talvez";
    const fetcher = respond(`${SUFFIX}:1`);
    expect(await isPasswordLeaked("password", { fetch: fetcher })).toBe(true);
    expect(warn).toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalled();
  });
});

describe("rejectLeakedPassword", () => {
  it("ignores values that are not strings", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(rejectLeakedPassword(undefined)).resolves.toBeUndefined();
    await expect(rejectLeakedPassword(42)).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("throws PASSWORD_COMPROMISED for a leaked password", async () => {
    vi.stubGlobal("fetch", respond(`${SUFFIX}:9`));
    await expect(rejectLeakedPassword("password")).rejects.toMatchObject({
      body: { code: "PASSWORD_COMPROMISED" },
    });
    vi.unstubAllGlobals();
  });
});
