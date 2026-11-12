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
