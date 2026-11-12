import { describe, expect, it } from "vitest";
import {
  balancePhrase,
  memberName,
  memberStatusLabel,
  membersLine,
  percentLabel,
  settlementLine,
  splitErrorLabel,
} from "./labels";
import { shareMessage, shareMessageHasAmounts } from "./messages";

// formatBRL puts a non-breaking space after "R$".
const brl = (text: string) => text.replaceAll(" ", " ");

describe("balancePhrase", () => {
  it("names the other person when only one payment involves the viewer", () => {
    expect(
      brl(balancePhrase([{ name: "Bruno", amountCents: 12_000 }]).text),
    ).toBe("Bruno te deve R$ 120,00");
    const owing = balancePhrase([{ name: "Bruno", amountCents: -8_000 }]);
    expect(brl(owing.text)).toBe("Você deve R$ 80,00 para Bruno");
    expect(owing).toMatchObject({
      tone: "expense",
      amountCents: 8_000,
      before: "Você deve ",
    });
  });

  it("sums several payments and says when all is settled", () => {
    expect(
      brl(
        balancePhrase([
          { name: "Bruno", amountCents: 12_000 },
          { name: "Carla", amountCents: 8_000 },
        ]).text,
      ),
    ).toBe("Você tem R$ 200,00 a receber");
    expect(balancePhrase([])).toMatchObject({
      text: "Tudo acertado",
      tone: "settled",
      amountCents: null,
    });
  });
});

describe("member labels", () => {
  it("marks who left or whose account was deleted", () => {
    expect(
      memberName({ name: "Bruno", status: "active", deleted: false }),
    ).toBe("Bruno");
    expect(memberName({ name: "Bruno", status: "left", deleted: false })).toBe(
      "Bruno (saiu)",
    );
    expect(memberName({ name: "Bruno", status: "left", deleted: true })).toBe(
      "Bruno (conta excluída)",
    );
  });

  it("tells every status", () => {
    const base = {
      role: "member" as const,
      isMe: false,
      deleted: false,
      todayIso: "2026-11-12",
      expiresOn: "2026-11-26",
    };
    expect(memberStatusLabel({ ...base, status: "invited" })).toBe(
      "Convite enviado · vale até 26/nov",
    );
    expect(
      memberStatusLabel({
        ...base,
        status: "invited",
        expiresOn: "2026-11-11",
      }),
    ).toBe("Convite expirado");
    expect(memberStatusLabel({ ...base, status: "declined" })).toBe("Recusou");
    expect(memberStatusLabel({ ...base, status: "left" })).toBe("Saiu");
    expect(
      memberStatusLabel({ ...base, status: "active", role: "owner" }),
    ).toBe("Criou o grupo");
    expect(memberStatusLabel({ ...base, status: "active", isMe: true })).toBe(
      "Você",
    );
    expect(memberStatusLabel({ ...base, status: "left", deleted: true })).toBe(
      "Conta excluída",
    );
  });

  it("lists the people and reads settlements", () => {
    expect(membersLine([])).toBe("Só você");
    expect(membersLine(["Bruno"])).toBe("Você e Bruno");
    expect(membersLine(["Bruno", "Carla"])).toBe("Você, Bruno e Carla");
    const line = (fromIsMe: boolean, toIsMe: boolean) =>
      brl(
        settlementLine({
          fromName: "Bruno",
          toName: "Ana",
          fromIsMe,
          toIsMe,
          amountCents: 12_000,
        }),
      );
    expect(line(false, true)).toBe("Bruno acertou R$ 120,00 com você");
    expect(line(true, false)).toBe("Você acertou R$ 120,00 com Ana");
    expect(line(false, false)).toBe("Bruno acertou R$ 120,00 com Ana");
  });
});

describe("splitErrorLabel", () => {
  it("says what is missing or over, in pt-BR", () => {
    expect(
      brl(splitErrorLabel({ kind: "amounts_short", missingCents: 1_200 })),
    ).toBe("Faltam R$ 12,00 para fechar o total.");
    expect(
      brl(splitErrorLabel({ kind: "amounts_over", excessCents: 300 })),
    ).toBe("Passou R$ 3,00 do total.");
    expect(
      splitErrorLabel({ kind: "percent_sum", sumBasisPoints: 9_000 }),
    ).toBe("Os percentuais somam 90%. Precisam somar 100%.");
    expect(percentLabel(3_333)).toBe("33,33%");
  });
});

describe("shareMessage", () => {
  const group = { groupId: "g", groupName: "Casa" };

  it("writes the invite and the membership notices", () => {
    expect(
      shareMessage(
        {
          type: "share_invite",
          ...group,
          memberId: "m",
          inviterName: "Ana",
          inviterEmail: "ana@exemplo.com",
        },
        true,
      ),
    ).toEqual({
      title: "Convite para dividir",
      body: "Ana (ana@exemplo.com) convidou você para o grupo Casa.",
    });
    expect(
      shareMessage(
        { type: "share_joined", ...group, memberName: "Bruno" },
        false,
      ).body,
    ).toBe("Bruno entrou no grupo Casa.");
    expect(
      shareMessage({ type: "share_removed", ...group, actorName: "Ana" }, false)
        .body,
    ).toBe("Ana tirou você do grupo Casa.");
  });

  it("leaves amounts out without showAmounts", () => {
    const one = {
      type: "shared_activity" as const,
      ...group,
      actorName: "Ana",
      added: 1,
      addedCents: 30_000,
      myShareCents: 15_000,
      changed: 0,
      removed: 0,
      description: "Mercado",
    };
    expect(brl(shareMessage(one, true).body)).toBe(
      "Ana adicionou Mercado (R$ 300,00). Sua parte: R$ 150,00.",
    );
    expect(shareMessage(one, false).body).toBe("Ana adicionou Mercado.");
    const many = { ...one, added: 3, addedCents: 54_000 };
    expect(brl(shareMessage(many, true).body)).toBe(
      "Ana adicionou 3 despesas (R$ 540,00). Sua parte: R$ 150,00.",
    );
    expect(shareMessage(many, false).body).toBe("Ana adicionou 3 despesas.");
    const changes = {
      ...one,
      added: 0,
      addedCents: 0,
      myShareCents: 0,
      changed: 1,
      removed: 1,
    };
    expect(shareMessage(changes, true).body).toBe(
      "Ana mudou 1 despesa e tirou 1.",
    );
    expect(shareMessageHasAmounts(changes)).toBe(false);
    expect(shareMessageHasAmounts(one)).toBe(true);

    const settled = {
      type: "share_settled" as const,
      ...group,
      actorName: "Ana",
      settlementId: "s",
      amountCents: 12_000,
      direction: "paid_you" as const,
      date: "2026-11-12",
    };
    expect(brl(shareMessage(settled, true).body)).toBe(
      "Ana marcou um acerto de R$ 120,00 com você em Casa.",
    );
    expect(shareMessage(settled, false).body).toBe(
      "Ana marcou um acerto com você em Casa.",
    );
  });
});
