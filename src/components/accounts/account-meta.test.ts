import { describe, expect, it } from "vitest";
import {
  accountGroupOf,
  accountHref,
  accountTypeFromParam,
  cardCycleError,
  cardCycleSummary,
  cardUsage,
  MONTH_DAYS,
} from "./account-meta";

describe("accountGroupOf", () => {
  it("splits accounts into Disponível, Investimentos and Cartões", () => {
    expect(accountGroupOf("checking")).toBe("available");
    expect(accountGroupOf("cash")).toBe("available");
    expect(accountGroupOf("other")).toBe("available");
    expect(accountGroupOf("savings")).toBe("investments");
    expect(accountGroupOf("investment")).toBe("investments");
    expect(accountGroupOf("credit_card")).toBe("cards");
  });
});

describe("accountTypeFromParam", () => {
  it("reads pt-BR slugs and enum values, defaulting to Conta corrente", () => {
    expect(accountTypeFromParam("cartao")).toBe("credit_card");
    expect(accountTypeFromParam("poupanca")).toBe("savings");
    expect(accountTypeFromParam("investment")).toBe("investment");
    expect(accountTypeFromParam(undefined)).toBe("checking");
    expect(accountTypeFromParam(["cartao"])).toBe("checking");
    expect(accountTypeFromParam("constructor")).toBe("checking");
  });
});

describe("accountHref", () => {
  it("sends cards to their invoice screen", () => {
    expect(accountHref({ id: "a", type: "checking" })).toBe("/contas/a");
    expect(accountHref({ id: "c", type: "credit_card" })).toBe("/cartoes/c");
  });
});

describe("cardUsage", () => {
  it("counts what is owed and the future installments against the limit", () => {
    expect(
      cardUsage({
        balanceCents: -138_042,
        pendingCents: -39_992,
        card: { limitCents: 550_000 },
      }),
    ).toEqual({
      owedCents: 138_042,
      futureCents: 39_992,
      limitCents: 550_000,
      availableCents: 371_966,
    });
  });

  it("ignores credits (a card paid in excess owes nothing)", () => {
    expect(
      cardUsage({ balanceCents: 5_000, pendingCents: 0, card: null }),
    ).toEqual({
      owedCents: 0,
      futureCents: 0,
      limitCents: 0,
      availableCents: 0,
    });
  });
});

describe("cardCycleError", () => {
  it("asks for both days", () => {
    expect(cardCycleError(null, 10)?.field).toBe("closingDay");
    expect(cardCycleError(3, null)?.field).toBe("dueDay");
  });

  it("accepts every cycle the engine accepts", () => {
    for (const closingDay of MONTH_DAYS) {
      for (const dueDay of MONTH_DAYS) {
        const invalid = dueDay > closingDay && closingDay >= 28;
        expect(cardCycleError(closingDay, dueDay) === null).toBe(!invalid);
      }
    }
  });

  it("explains the closing-day-28 rule", () => {
    expect(cardCycleError(28, 30)?.message).toBe(
      "Com fechamento no dia 28 ou depois, o vencimento cai no mês seguinte: escolha um dia até 28.",
    );
  });
});

describe("cardCycleSummary", () => {
  it("says in which month the invoice is due", () => {
    expect(cardCycleSummary(17, 25)).toBe(
      "Fecha dia 17 e vence dia 25 do mesmo mês.",
    );
    expect(cardCycleSummary(28, 5)).toBe(
      "Fecha dia 28 e vence dia 5 do mês seguinte.",
    );
  });
});
