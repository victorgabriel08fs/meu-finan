import { describe, expect, it } from "vitest";
import {
  type AccountAction,
  accountActionBlocker,
  type GuardAccount,
  LAST_ADMIN_MESSAGE,
  OWNER_DELETE_MESSAGE,
  OWNER_LINK_MESSAGE,
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
    const input = {
      actorId: "ana",
      target: bruno,
      activeAdminIds: ["ana"],
      targetIsOwner: false,
    };
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
      targetIsOwner: false,
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
      targetIsOwner: false,
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
      targetIsOwner: false,
    };
    for (const action of ["ban", "demote", "delete"] as const) {
      expect(accountActionBlocker(action, pair), action).toBeNull();
    }
  });

  it("never lets another administrator delete or reset the owner's account", () => {
    const owner = {
      actorId: "bia",
      target: ana,
      activeAdminIds: ["ana", "bia"],
      targetIsOwner: true,
    };
    expect(accountActionBlocker("delete", owner)).toBe(OWNER_DELETE_MESSAGE);
    expect(accountActionBlocker("create_link", owner)).toBe(OWNER_LINK_MESSAGE);
    // What can be undone (and /recuperar undoes) stays allowed.
    for (const action of [
      "ban",
      "demote",
      "revoke_sessions",
      "revoke_link",
    ] as const) {
      expect(accountActionBlocker(action, owner), action).toBeNull();
    }
    // A deactivated owner: still no reset link, with the owner's reason.
    expect(
      accountActionBlocker("create_link", {
        ...owner,
        target: { ...ana, role: "user", banned: true },
      }),
    ).toBe(OWNER_LINK_MESSAGE);
    // The owner's own sheet keeps the self messages.
    expect(
      accountActionBlocker("delete", { ...owner, actorId: "ana" }),
    ).toMatch(/Você não pode excluir/);
  });

  it("explains actions that do not apply to the account's state", () => {
    const admins = ["ana", "bia"];
    const on = (target: GuardAccount) => ({
      actorId: "ana",
      target,
      activeAdminIds: admins,
      targetIsOwner: false,
    });
    expect(accountActionBlocker("ban", on(carla))).toMatch(
      /já está desativada/,
    );
    expect(accountActionBlocker("unban", on(bruno))).toMatch(/já está ativa/);
    expect(accountActionBlocker("promote", on(bia))).toMatch(
      /já é administradora/,
    );
    expect(accountActionBlocker("promote", on(carla))).toMatch(/Reative/);
    expect(accountActionBlocker("demote", on(bruno))).toMatch(
      /não é administradora/,
    );
    expect(accountActionBlocker("create_link", on(carla))).toMatch(/Reative/);
  });

  it("allows deleting or reactivating a deactivated account", () => {
    const input = {
      actorId: "ana",
      target: carla,
      activeAdminIds: ["ana"],
      targetIsOwner: false,
    };
    expect(accountActionBlocker("delete", input)).toBeNull();
    expect(accountActionBlocker("unban", input)).toBeNull();
  });

  it("returns a message or null for every action", () => {
    for (const targetIsOwner of [false, true]) {
      for (const action of ALL) {
        const result = accountActionBlocker(action, {
          actorId: "ana",
          target: bruno,
          activeAdminIds: ["ana"],
          targetIsOwner,
        });
        expect(result === null || typeof result === "string").toBe(true);
      }
    }
  });
});
