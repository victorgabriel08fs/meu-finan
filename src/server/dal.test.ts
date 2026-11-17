// The DAL's terms gate (doc 01 §11.8): a session whose accepted version is
// missing or older goes to /aceitar-termos on every page, administrators
// included; only requireSignedIn lets it through.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEGAL_VERSION } from "@/lib/legal/version";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
// Like Next, redirect() and notFound() throw to stop the render.
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
// One request at a time here: no per-request deduplication.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/auth", () => ({
  auth: { api: { getSession: async () => session.current } },
}));

import { getAdmin, requireAdmin, requireSignedIn, requireUser } from "./dal";

const signedInAs = (role: string, legalVersion: string | null) => {
  session.current = {
    user: {
      id: "u1",
      name: "Ana",
      email: "ana@exemplo.com",
      role,
      banned: false,
      legalVersion,
    },
  };
};

beforeEach(() => {
  session.current = null;
});

describe("terms gate", () => {
  it("sends a signed-out visitor to /entrar", async () => {
    await expect(requireUser()).rejects.toThrow("redirect:/entrar");
    await expect(requireSignedIn()).rejects.toThrow("redirect:/entrar");
  });

  it("sends nobody to /aceitar-termos with the current version accepted", async () => {
    signedInAs("user", LEGAL_VERSION);
    await expect(requireUser()).resolves.toMatchObject({
      id: "u1",
      legalVersion: LEGAL_VERSION,
    });
  });

  it("sends an account with no accepted version to /aceitar-termos", async () => {
    signedInAs("user", null);
    await expect(requireUser()).rejects.toThrow("redirect:/aceitar-termos");
  });

  it("sends an account with an older version to /aceitar-termos", async () => {
    signedInAs("user", "2020-01-01");
    await expect(requireUser()).rejects.toThrow("redirect:/aceitar-termos");
  });

  it("still lets requireSignedIn through (the acceptance screen itself)", async () => {
    signedInAs("user", null);
    await expect(requireSignedIn()).resolves.toMatchObject({
      legalVersion: null,
    });
  });

  it("holds an administrator back too, in the pages and in the actions", async () => {
    signedInAs("admin", null);
    await expect(requireAdmin()).rejects.toThrow("redirect:/aceitar-termos");
    await expect(getAdmin()).resolves.toBeNull();
    signedInAs("admin", LEGAL_VERSION);
    await expect(getAdmin()).resolves.toMatchObject({ role: "admin" });
  });
});
