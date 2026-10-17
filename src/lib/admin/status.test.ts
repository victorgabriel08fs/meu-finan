import { describe, expect, it } from "vitest";
import { hasAdminRole, toUserRole } from "./roles";
import { accountStatus } from "./status";

describe("roles", () => {
  it("recognises admin in a single role or a role list", () => {
    expect(hasAdminRole("admin")).toBe(true);
    expect(hasAdminRole("user, admin")).toBe(true);
    expect(hasAdminRole("user")).toBe(false);
    expect(hasAdminRole("administrador")).toBe(false);
    expect(hasAdminRole(null)).toBe(false);
    expect(hasAdminRole(undefined)).toBe(false);
    expect(hasAdminRole("")).toBe(false);
  });

  it("reads a missing role as a regular user", () => {
    expect(toUserRole(null)).toBe("user");
    expect(toUserRole("admin")).toBe("admin");
  });
});

describe("accountStatus", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const later = new Date("2026-10-18T12:00:00Z");
  const earlier = new Date("2026-10-16T12:00:00Z");

  it("puts Desativado above everything", () => {
    expect(
      accountStatus(
        { banned: true, hasAccess: true, inviteExpiresAt: later },
        now,
      ),
    ).toBe("deactivated");
    expect(
      accountStatus(
        { banned: true, hasAccess: false, inviteExpiresAt: null },
        now,
      ),
    ).toBe("deactivated");
  });

  it("is active once the person has a password or a passkey", () => {
    expect(
      accountStatus(
        { banned: false, hasAccess: true, inviteExpiresAt: null },
        now,
      ),
    ).toBe("active");
    // A reset link does not make an account pending again.
    expect(
      accountStatus(
        { banned: false, hasAccess: true, inviteExpiresAt: later },
        now,
      ),
    ).toBe("active");
  });

  it("tells a pending invite from an expired or invalidated one", () => {
    expect(
      accountStatus(
        { banned: false, hasAccess: false, inviteExpiresAt: later },
        now,
      ),
    ).toBe("invite_pending");
    expect(
      accountStatus(
        { banned: false, hasAccess: false, inviteExpiresAt: earlier },
        now,
      ),
    ).toBe("invite_expired");
    expect(
      accountStatus(
        { banned: false, hasAccess: false, inviteExpiresAt: now },
        now,
      ),
    ).toBe("invite_expired");
    expect(
      accountStatus(
        { banned: false, hasAccess: false, inviteExpiresAt: null },
        now,
      ),
    ).toBe("invite_expired");
  });
});
