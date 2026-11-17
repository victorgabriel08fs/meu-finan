import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hashForLog, requestMeta } from "./log";

describe("hashForLog", () => {
  it("is deterministic, 16 hex chars and not the value", () => {
    const hash = hashForLog("203.0.113.7");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hashForLog("203.0.113.7")).toBe(hash);
    expect(hash).not.toContain("203");
    expect(hashForLog("203.0.113.8")).not.toBe(hash);
  });
});

describe("requestMeta", () => {
  it("never carries the address in the clear", () => {
    const meta = requestMeta(
      new Headers({
        "x-forwarded-for": "203.0.113.7",
        "x-vercel-ip-country": "BR",
      }),
    );
    expect(meta.country).toBe("BR");
    expect(JSON.stringify(meta)).not.toContain("203.0.113.7");
    expect(requestMeta(undefined).country).toBeNull();
  });
});
