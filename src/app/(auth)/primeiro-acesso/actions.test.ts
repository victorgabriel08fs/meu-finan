// First access: the terms checkbox is checked on the server before anything
// else (doc 01 §11.8).
import { describe, expect, it, vi } from "vitest";
import { LEGAL_OUTDATED, LEGAL_REQUIRED } from "@/lib/legal/version";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
const signUp = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth", () => ({
  SETUP_TOKEN_HEADER: "x-setup",
  LEGAL_VERSION_HEADER: "x-legal",
  auth: { api: { signUpEmail: signUp } },
}));
vi.mock("@/server/db/client", () => ({ db: {} }));
vi.mock("@/server/security/throttle", () => ({
  throttle: async () => ({ ok: true }),
}));

import { setupOwner } from "./actions";

const input = {
  token: "codigo",
  name: "Ana",
  email: "ana@exemplo.com",
  password: "uma senha bem longa",
  confirm: "uma senha bem longa",
  acceptedLegal: true as const,
  legalVersion: "2020-01-01",
};

describe("setupOwner", () => {
  it("refuses an unticked checkbox with a field error", async () => {
    const result = await setupOwner({
      ...input,
      acceptedLegal: false as unknown as true,
    });
    expect(result?.validationErrors?.fieldErrors.acceptedLegal).toEqual([
      LEGAL_REQUIRED,
    ]);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("refuses a screen from another version", async () => {
    const result = await setupOwner(input);
    expect(result?.serverError).toBe(LEGAL_OUTDATED);
    expect(signUp).not.toHaveBeenCalled();
  });
});
