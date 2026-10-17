import { describe, expect, it } from "vitest";
import {
  clientAddress,
  isOwnerEmail,
  safeRedirectPath,
  secretMatches,
} from "./guards";

describe("secretMatches", () => {
  const secret = "s".repeat(40);

  it("accepts the exact secret", () => {
    expect(secretMatches(secret, secret)).toBe(true);
  });

  it("rejects a different secret of any length", () => {
    expect(secretMatches(`${secret}x`, secret)).toBe(false);
    expect(secretMatches(secret.slice(1), secret)).toBe(false);
    expect(secretMatches("S".repeat(40), secret)).toBe(false);
  });

  it("fails closed when either side is missing or empty", () => {
    expect(secretMatches("", "")).toBe(false);
    expect(secretMatches(secret, undefined)).toBe(false);
    expect(secretMatches(undefined, secret)).toBe(false);
    expect(secretMatches(null, null)).toBe(false);
  });
});

describe("isOwnerEmail", () => {
  it("matches ignoring case and surrounding spaces", () => {
    expect(isOwnerEmail(" Dono@Exemplo.com ", "dono@exemplo.com")).toBe(true);
  });

  it("rejects other e-mails and missing values", () => {
    expect(isOwnerEmail("outro@exemplo.com", "dono@exemplo.com")).toBe(false);
    expect(isOwnerEmail("dono@exemplo.com", undefined)).toBe(false);
    expect(isOwnerEmail(undefined, "dono@exemplo.com")).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it.each([
    ["/extrato", "/extrato"],
    ["/extrato?mes=2026-10", "/extrato?mes=2026-10"],
    ["/planejar/metas#topo", "/planejar/metas#topo"],
  ])("keeps same-origin path %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    null,
    "",
    "extrato",
    "//evil.example",
    "/\\evil.example",
    "https://evil.example/inicio",
    "javascript:alert(1)",
    "/\u0000inicio",
    "/entrar",
    "/entrar?voltar=/inicio",
    "/primeiro-acesso",
    "/recuperar/x",
    "/convite/abc.def",
  ])("falls back for unsafe target %j", (input) => {
    expect(safeRedirectPath(input as string | null)).toBe("/inicio");
  });

  it("uses the given fallback", () => {
    expect(safeRedirectPath("//x", "/ajustes")).toBe("/ajustes");
  });
});

describe("clientAddress", () => {
  it("uses the first forwarded hop", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientAddress(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip and then to a constant", () => {
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
    expect(clientAddress(new Headers())).toBe("local");
  });
});
