// The checks that come before the slow password hash in the invite action:
// an invite needs the terms checkbox and the current version, a reset does
// not (doc 01 §11.8, §11.9).
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEGAL_OUTDATED,
  LEGAL_REQUIRED,
  LEGAL_VERSION,
} from "@/lib/legal/version";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  // The shape of Next's redirect error, which next-safe-action rethrows.
  redirect: (to: string) => {
    throw Object.assign(new Error(`redirect:${to}`), {
      digest: `NEXT_REDIRECT;replace;${to};307;`,
    });
  },
}));
const mocks = vi.hoisted(() => ({
  purpose: "invite" as "invite" | "reset",
  hash: vi.fn(async (password: string) => `hash:${password}`),
  accept: vi.fn(),
}));
vi.mock("@/server/auth", () => ({
  auth: {
    $context: Promise.resolve({ password: { hash: mocks.hash } }),
    api: { signInEmail: vi.fn() },
  },
}));
vi.mock("@/server/security/throttle", () => ({
  throttle: async () => ({ ok: true }),
}));
vi.mock("@/server/db/seed-defaults", () => ({
  ensureOwnerDefaults: vi.fn(),
}));
vi.mock("@/server/domain/access-links", () => ({
  LINK_UNAVAILABLE: "Este link não funciona mais.",
  inspectAccessLink: async () => ({ state: "valid", purpose: mocks.purpose }),
  acceptAccessLink: mocks.accept,
}));

import { acceptAccessLinkAction } from "./actions";

const input = {
  token: "abc",
  password: "uma senha bem longa",
  confirm: "uma senha bem longa",
  removePasskeys: false,
  acceptedLegal: true,
  legalVersion: LEGAL_VERSION,
};

beforeEach(() => {
  mocks.purpose = "invite";
  mocks.hash.mockClear();
  mocks.accept.mockReset();
  mocks.accept.mockResolvedValue({
    userId: "u1",
    email: "bruno@exemplo.com",
    purpose: "invite",
  });
});

describe("accepting an invite", () => {
  it("needs the checkbox, before the password is hashed", async () => {
    const result = await acceptAccessLinkAction({
      ...input,
      acceptedLegal: false,
    });
    expect(result?.serverError).toBe(LEGAL_REQUIRED);
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("refuses a screen from another version, before the hash", async () => {
    for (const legalVersion of ["2020-01-01", undefined]) {
      const result = await acceptAccessLinkAction({ ...input, legalVersion });
      expect(result?.serverError).toBe(LEGAL_OUTDATED);
    }
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it("hands the version to the domain when it is all in order", async () => {
    await expect(acceptAccessLinkAction(input)).rejects.toThrow("redirect:");
    expect(mocks.accept).toHaveBeenCalledWith(
      "abc",
      expect.objectContaining({ legalVersion: LEGAL_VERSION }),
    );
  });
});

describe("accepting a reset link", () => {
  it("asks for no checkbox", async () => {
    mocks.purpose = "reset";
    mocks.accept.mockResolvedValue({
      userId: "u1",
      email: "bruno@exemplo.com",
      purpose: "reset",
    });
    await expect(
      acceptAccessLinkAction({
        ...input,
        acceptedLegal: false,
        legalVersion: undefined,
      }),
    ).rejects.toThrow("redirect:/ajustes/seguranca");
    expect(mocks.accept).toHaveBeenCalled();
  });
});
