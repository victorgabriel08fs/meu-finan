import { describe, expect, it } from "vitest";
import { defaultFlags } from "@/lib/flags/registry";
import {
  DISCREET_BODY,
  payloadHasAmounts,
  renderNotice,
  visibleNotificationTypes,
} from "./kinds";

const bills = {
  type: "bills_due",
  date: "2026-11-09",
  title: "2 contas vencem em breve",
  body: "Condomínio (R$ 650,00) e Internet (R$ 120,00)",
  url: "/extrato?status=pendente",
  amounts: true,
} as const;

describe("renderNotice", () => {
  it("renders a daily notice from the texts it stored, with its action", () => {
    expect(renderNotice(bills, { discreet: false })).toMatchObject({
      title: bills.title,
      body: bills.body,
      href: "/extrato?status=pendente",
      actions: [{ id: "open", label: "Ver contas" }],
    });
  });

  it("hides the body with amounts in the privacy mode, not one without", () => {
    expect(renderNotice(bills, { discreet: true })?.body).toBe(DISCREET_BODY);
    expect(
      renderNotice({ ...bills, amounts: false }, { discreet: true })?.body,
    ).toBe(bills.body);
    // Rows from before the field count as "may carry amounts".
    const { amounts: _amounts, ...old } = bills;
    expect(payloadHasAmounts(old)).toBe(true);
    expect(renderNotice(old, { discreet: true })?.body).toBe(DISCREET_BODY);
  });

  it("has no kind for a type nobody writes", () => {
    expect(
      renderNotice(
        { type: "goal_reached", goalId: "x", goalName: "Reserva" },
        { discreet: false },
      ),
    ).toBeNull();
  });
});

describe("visibleNotificationTypes", () => {
  it("lists the daily notices", () => {
    expect(visibleNotificationTypes(defaultFlags()).sort()).toEqual([
      "bills_due",
      "daily_summary",
      "income_countdown",
      "monthly_summary",
      "non_business_due",
      "weekly_summary",
    ]);
  });
});

describe("the notices of a group", () => {
  const invite = {
    type: "share_invite",
    groupId: "g1",
    memberId: "m1",
    groupName: "Casa",
    inviterName: "Ana",
    inviterEmail: "ana@exemplo.com",
  } as const;
  const settled = {
    type: "share_settled",
    groupId: "g1",
    groupName: "Casa",
    actorName: "Ana",
    settlementId: "s1",
    amountCents: 12_000,
    direction: "paid_you",
    date: "2026-11-12",
  } as const;

  it("exist only with financas_compartilhadas", () => {
    const on = visibleNotificationTypes({
      ...defaultFlags(),
      financas_compartilhadas: true,
    });
    expect(on).toContain("share_invite");
    expect(on).toContain("shared_activity");
    expect(visibleNotificationTypes(defaultFlags())).not.toContain(
      "share_invite",
    );
  });

  it("offer Aceitar and Recusar on an invite, and Lançar no extrato on a settlement", () => {
    expect(renderNotice(invite, { discreet: false })).toMatchObject({
      title: "Convite para dividir",
      href: "/compartilhado",
      actions: [
        { id: "accept_share", label: "Aceitar" },
        { id: "decline_share", label: "Recusar" },
      ],
    });
    expect(renderNotice(settled, { discreet: false })).toMatchObject({
      href: "/compartilhado/g1",
      actions: [
        { id: "record_settlement", label: "Lançar no extrato" },
        { id: "open", label: "Ver grupo" },
      ],
    });
  });

  it("hide the amount of a settlement in the privacy mode, never an invite", () => {
    expect(payloadHasAmounts(invite)).toBe(false);
    expect(payloadHasAmounts(settled)).toBe(true);
    expect(renderNotice(settled, { discreet: true })?.body).toBe(DISCREET_BODY);
    expect(renderNotice(invite, { discreet: true })?.body).toContain(
      "convidou você",
    );
  });
});
