import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, MIN_TOKEN_LENGTH, proxy } from "./proxy";

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

describe("proxy matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it("deixa passar as imagens públicas (crawlers e o iOS vão sem cookie)", () => {
    for (const path of [
      "/opengraph-image",
      "/opengraph-image-abc123",
      "/twitter-image",
      "/twitter-image-abc123",
      "/splash/dark-1170x2532.png",
      "/icons/icon-192.png",
      "/apple-icon",
    ]) {
      expect(matcher.test(path), path).toBe(false);
    }
  });

  it("deixa os termos e a política públicos, com ou sem sessão", () => {
    for (const path of ["/termos", "/privacidade"]) {
      expect(matcher.test(path), path).toBe(false);
    }
  });

  it("protege /aceitar-termos como qualquer tela", () => {
    expect(matcher.test("/aceitar-termos")).toBe(true);
  });

  it("continua protegendo as telas e as APIs", () => {
    for (const path of ["/inicio", "/api/x", "/admin", "/convite/abc"]) {
      expect(matcher.test(path), path).toBe(true);
    }
  });
});
