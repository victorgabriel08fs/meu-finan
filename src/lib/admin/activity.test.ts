import { describe, expect, it } from "vitest";
import { type ActivityEntry, describeActivity } from "./activity";

const base: ActivityEntry = {
  action: "user.created",
  actorId: "ana",
  actorName: "Ana",
  targetUserId: "bruno",
  targetName: "Bruno Lima",
  targetEmail: "bruno@exemplo.com",
  metadata: {},
};

const line = (patch: Partial<ActivityEntry>, viewer: string | null = null) =>
  describeActivity({ ...base, ...patch }, viewer);

describe("describeActivity", () => {
  it("names the viewer as Você", () => {
    expect(line({}, "ana").title).toBe("Você convidou Bruno Lima");
    expect(line({}, "outra").title).toBe("Ana convidou Bruno Lima");
  });

  it("describes invites and links", () => {
    expect(line({ metadata: { role: "admin" } })).toEqual({
      kind: "invite",
      title: "Ana convidou Bruno Lima",
      detail: "bruno@exemplo.com · papel: administrador",
    });
    expect(
      line({ action: "access_link.created", metadata: { purpose: "reset" } })
        .title,
    ).toBe("Ana gerou um link de redefinição para Bruno Lima");
    expect(
      line({ action: "access_link.created", metadata: { purpose: "invite" } })
        .title,
    ).toBe("Ana gerou um novo convite para Bruno Lima");
    // "The previous link stopped working" only when there was a live one.
    expect(
      line({ action: "access_link.created", metadata: { purpose: "reset" } })
        .detail,
    ).toBeUndefined();
    expect(
      line({
        action: "access_link.created",
        metadata: { purpose: "reset", replaced: true },
      }).detail,
    ).toBe("O link anterior deixou de funcionar");
    expect(line({ action: "access_link.revoked" }).title).toBe(
      "Ana invalidou o link de Bruno Lima",
    );
  });

  it("tells accepting an invite from resetting access", () => {
    const accepted = {
      action: "access_link.accepted",
      actorId: "bruno",
      actorName: "Bruno Lima",
    };
    expect(line({ ...accepted, metadata: { purpose: "invite" } }).title).toBe(
      "Bruno Lima aceitou o convite",
    );
    expect(
      line({
        ...accepted,
        metadata: { purpose: "reset", removedPasskeys: true },
      }),
    ).toEqual({
      kind: "accepted",
      title: "Bruno Lima redefiniu o acesso",
      detail: "Senha nova, sessões encerradas e passkeys removidas",
    });
  });

  it("describes account changes", () => {
    expect(line({ action: "user.banned", metadata: { sessions: 2 } })).toEqual({
      kind: "ban",
      title: "Ana desativou Bruno Lima",
      detail: "2 sessões encerradas",
    });
    expect(line({ action: "user.banned" }).detail).toBeUndefined();
    expect(line({ action: "user.unbanned" }).title).toBe(
      "Ana reativou Bruno Lima",
    );
    expect(
      line({ action: "user.sessions_revoked", metadata: { sessions: 1 } })
        .detail,
    ).toBe("1 sessão encerrada");
    expect(
      line({ action: "user.role_changed", metadata: { role: "admin" } }).title,
    ).toBe("Ana deu acesso de administrador a Bruno Lima");
    expect(
      line({ action: "user.role_changed", metadata: { role: "user" } }).title,
    ).toBe("Ana tirou o acesso de administrador de Bruno Lima");
    expect(line({ action: "user.deleted", targetUserId: null })).toEqual({
      kind: "delete",
      title: "Ana excluiu a conta de Bruno Lima",
      detail: "bruno@exemplo.com · com todas as finanças",
    });
  });

  it("describes flags with their registry label", () => {
    const flag = (action: string, value: boolean | null) =>
      line({ action, metadata: { flag: "importar_extrato", value } }).title;
    expect(flag("flag.global_set", false)).toBe(
      "Ana desligou Importar extrato para todos",
    );
    expect(flag("flag.global_set", true)).toBe(
      "Ana ligou Importar extrato para todos",
    );
    expect(flag("flag.global_set", null)).toBe(
      "Ana voltou Importar extrato ao padrão",
    );
    expect(flag("flag.user_set", false)).toBe(
      "Ana desligou Importar extrato para Bruno Lima",
    );
    expect(flag("flag.user_set", null)).toBe(
      "Ana tirou a exceção de Importar extrato para Bruno Lima",
    );
    // A flag that left the registry keeps its key.
    expect(
      line({
        action: "flag.global_set",
        metadata: { flag: "flag_antiga", value: true },
      }).title,
    ).toBe("Ana ligou flag_antiga para todos");
  });

  it("survives unknown actions and missing names", () => {
    expect(
      line({ action: "algo.novo", targetName: null, targetEmail: null }),
    ).toEqual({ kind: "other", title: "Ana fez uma alteração" });
    expect(line({ action: "user.unbanned", targetName: null }).title).toBe(
      "Ana reativou bruno@exemplo.com",
    );
  });

  it("describes the break-glass recovery", () => {
    expect(
      line({
        action: "access.recovered",
        actorId: "ana",
        actorName: "Ana",
        targetName: "Ana",
        metadata: { removedPasskeys: false },
      }),
    ).toEqual({
      kind: "accepted",
      title: "Ana recuperou o acesso com o código de emergência",
      detail: "Senha nova e sessões encerradas",
    });
  });

  it("describes the first access", () => {
    expect(
      line({ action: "setup.completed", targetName: null }, "ana"),
    ).toEqual({
      kind: "setup",
      title: "Você configurou o app",
      detail: "Primeiro acesso, como administrador",
    });
  });
});
