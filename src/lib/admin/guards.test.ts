import { describe, expect, it } from "vitest";
import {
  type AccountAction,
  accountActionBlocker,
  type GuardAccount,
  LAST_ADMIN_MESSAGE,
} from "./guards";

const ana: GuardAccount = { id: "ana", role: "admin", banned: false };
const bia: GuardAccount = { id: "bia", role: "admin", banned: false };
const bruno: GuardAccount = { id: "bruno", role: "user", banned: false };
const carla: GuardAccount = { id: "carla", role: "user", banned: true };

const ALL: AccountAction[] = [
  "ban",
  "unban",
  "promote",
  "demote",
  "delete",
  "revoke_sessions",
  "create_link",
  "revoke_link",
];

describe("accountActionBlocker", () => {
  it("lets an administrator act on a regular account", () => {
    const input = { actorId: "ana", target: bruno, activeAdminIds: ["ana"] };
    for (const action of [
      "ban",
      "promote",
      "delete",
      "revoke_sessions",
      "create_link",
      "revoke_link",
    ] as const) {
      expect(accountActionBlocker(action, input), action).toBeNull();
    }
  });

  it("never lets anyone deactivate, demote or delete themself", () => {
    const input = {
      actorId: "ana",
      target: ana,
      activeAdminIds: ["ana", "bia"],
    };
    for (const action of ["ban", "demote", "delete"] as const) {
      expect(accountActionBlocker(action, input), action).toMatch(/Você não/);
    }
    expect(accountActionBlocker("revoke_sessions", input)).toMatch(
      /Ajustes › Segurança/,
    );
    expect(accountActionBlocker("create_link", input)).toMatch(
      /Ajustes › Segurança/,
    );
  });

  it("keeps the last active administrator", () => {
    // Another administrator that is deactivated does not count.
    const alone = {
      actorId: "x",
      target: ana,
      activeAdminIds: ["ana"],
    };
    for (const action of ["ban", "demote", "delete"] as const) {
      expect(accountActionBlocker(action, alone), action).toBe(
        LAST_ADMIN_MESSAGE,
      );
    }
    // With a second active administrator, either one can go.
    const pair = {
      actorId: "bia",
      target: ana,
      activeAdminIds: ["ana", "bia"],
    };
    for (const action of ["ban", "demote", "delete"] as const) {
      expect(accountActionBlocker(action, pair), action).toBeNull();
    }
  });

  it("explains actions that do not apply to the account's state", () => {
    const admins = ["ana", "bia"];
    expect(
      accountActionBlocker("ban", {
        actorId: "ana",
        target: carla,
        activeAdminIds: admins,
      }),
    ).toMatch(/já está desativada/);
    expect(
      accountActionBlocker("unban", {
        actorId: "ana",
        target: bruno,
        activeAdminIds: admins,
      }),
    ).toMatch(/já está ativa/);
    expect(
      accountActionBlocker("promote", {
        actorId: "ana",
        target: bia,
        activeAdminIds: admins,
      }),
    ).toMatch(/já é administradora/);
    expect(
      accountActionBlocker("promote", {
        actorId: "ana",
        target: carla,
        activeAdminIds: admins,
      }),
    ).toMatch(/Reative/);
    expect(
      accountActionBlocker("demote", {
        actorId: "ana",
        target: bruno,
        activeAdminIds: admins,
      }),
    ).toMatch(/não é administradora/);
    expect(
      accountActionBlocker("create_link", {
        actorId: "ana",
        target: carla,
        activeAdminIds: admins,
      }),
    ).toMatch(/Reative/);
  });

  it("allows deleting or reactivating a deactivated account", () => {
    const input = { actorId: "ana", target: carla, activeAdminIds: ["ana"] };
    expect(accountActionBlocker("delete", input)).toBeNull();
    expect(accountActionBlocker("unban", input)).toBeNull();
  });

  it("returns a message or null for every action", () => {
    for (const action of ALL) {
      const result = accountActionBlocker(action, {
        actorId: "ana",
        target: bruno,
        activeAdminIds: ["ana"],
      });
      expect(result === null || typeof result === "string").toBe(true);
    }
  });
});
