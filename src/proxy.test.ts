import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MIN_TOKEN_LENGTH, proxy } from "./proxy";

afterEach(() => vi.unstubAllEnvs());

const call = () =>
  proxy(new NextRequest("http://localhost:3000/recuperar")).headers;

describe("proxy token gate", () => {
  it("closes /recuperar for a short token and opens it at the minimum", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("RECOVERY_TOKEN", "x".repeat(MIN_TOKEN_LENGTH - 1));
    expect(call().get("x-middleware-rewrite")).toContain("/nao-encontrada");
    vi.stubEnv("RECOVERY_TOKEN", "x".repeat(MIN_TOKEN_LENGTH));
    expect(call().get("x-middleware-next")).toBe("1");
  });
});
