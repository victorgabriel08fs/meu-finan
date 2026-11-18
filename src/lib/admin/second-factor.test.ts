import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ADMIN_SECTION_PATHS,
  adminGatePath,
  adminSecondFactor,
  canManagePasskeys,
  parseAdminReturnPath,
  stampPasskeySession,
} from "./second-factor";

const at = new Date("2026-11-17T12:00:00Z");

describe("adminSecondFactor", () => {
  it("is ok with a passkey session, whatever the passkey count", () => {
    expect(adminSecondFactor({ passkeyVerifiedAt: at, passkeyCount: 0 })).toBe(
      "ok",
    );
    expect(adminSecondFactor({ passkeyVerifiedAt: at, passkeyCount: 3 })).toBe(
      "ok",
    );
  });

  it("asks for a first passkey or a confirmation otherwise", () => {
    expect(
      adminSecondFactor({ passkeyVerifiedAt: null, passkeyCount: 0 }),
    ).toBe("register");
    expect(
      adminSecondFactor({ passkeyVerifiedAt: undefined, passkeyCount: 1 }),
    ).toBe("confirm");
  });
});

describe("canManagePasskeys", () => {
  it("blocks only an unconfirmed administrator who has a passkey", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.nat(5),
        (isAdmin, stamped, passkeyCount) => {
          const allowed = canManagePasskeys({
            isAdmin,
            passkeyVerifiedAt: stamped ? at : null,
            passkeyCount,
          });
          expect(allowed).toBe(!(isAdmin && !stamped && passkeyCount > 0));
        },
      ),
    );
  });
});

describe("parseAdminReturnPath", () => {
  it("accepts only the sections of Administração", () => {
    for (const path of ADMIN_SECTION_PATHS) {
      expect(parseAdminReturnPath(path)).toBe(path);
    }
    for (const value of [
      "//evil.com",
      "https://evil.com/admin/usuarios",
      "/admin/../inicio",
      "/admin/usuarios?x",
      "/inicio",
      undefined,
      ["/admin/flags"],
    ]) {
      expect(parseAdminReturnPath(value)).toBe("/admin/usuarios");
    }
  });

  it("encodes the return path in the gate link", () => {
    expect(adminGatePath("/admin/flags")).toBe(
      "/ajustes/seguranca/admin?voltar=%2Fadmin%2Fflags",
    );
  });
});

describe("stampPasskeySession", () => {
  it("stamps only sessions opened with a passkey", () => {
    expect(stampPasskeySession("/passkey/verify-authentication", at)).toEqual({
      data: { passkeyVerifiedAt: at },
    });
    for (const path of [
      "/sign-in/email",
      "/sign-up/email",
      "/passkey/verify-registration",
      // A Google sign-in is never a passkey.
      "/callback/:id",
      undefined,
    ]) {
      expect(stampPasskeySession(path, at)).toBeUndefined();
    }
  });
});
