import { describe, expect, it } from "vitest";
import { finAccountType } from "@/server/db/schema";
import {
  ACCOUNT_GROUPS,
  ACCOUNT_TYPE_OPTIONS,
  accountGroupOf,
  accountHref,
  accountTypeFromParam,
  accountTypeLabel,
  allowsNegativeBalance,
  cardCycleError,
  cardCycleSummary,
  cardUsage,
  defaultColorFor,
  defaultIncludeInNetWorth,
  MONTH_DAYS,
  netWorthDescription,
} from "./account-meta";

describe("accountGroupOf", () => {
  it("splits accounts into Disponível, Investimentos and Cartões", () => {
    expect(accountGroupOf("checking")).toBe("available");
    expect(accountGroupOf("cash")).toBe("available");
    expect(accountGroupOf("other")).toBe("available");
    expect(accountGroupOf("savings")).toBe("investments");
    expect(accountGroupOf("investment")).toBe("investments");
    expect(accountGroupOf("credit_card")).toBe("cards");
    expect(accountGroupOf("savings_box")).toBe("savings_boxes");
  });
});

describe("accountTypeFromParam", () => {
  it("reads pt-BR slugs and enum values, defaulting to Conta corrente", () => {
    expect(accountTypeFromParam("cartao")).toBe("credit_card");
    expect(accountTypeFromParam("caixinha")).toBe("savings_box");
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

describe("the caixinha type", () => {
  it("is offered, with the vault icon, and every enum type has a chip", () => {
    expect(
      ACCOUNT_TYPE_OPTIONS.find((option) => option.value === "savings_box"),
    ).toMatchObject({ label: "Caixinha", icon: "vault" });
    expect(ACCOUNT_TYPE_OPTIONS.map((option) => option.value).sort()).toEqual(
      [...finAccountType.enumValues].sort(),
    );
  });

  it("is green, never negative, and says it stays out of the Saldo", () => {
    expect(defaultColorFor("savings_box")).toBe("cat-6");
    expect(allowsNegativeBalance("savings_box")).toBe(false);
    expect(netWorthDescription("savings_box")).toContain(
      "não no Saldo em contas",
    );
    expect(netWorthDescription("checking")).toContain("patrimônio");
    expect(netWorthDescription("savings_box", false)).toBe(
      "O saldo não entra no patrimônio nem no Saldo em contas.",
    );
    expect(netWorthDescription("checking", false)).toBe(
      "O saldo fica fora do total das contas e do patrimônio.",
    );
  });
});

describe("the benefício type", () => {
  it("is offered after Dinheiro, with the crossed utensils and a suggested name", () => {
    const values = ACCOUNT_TYPE_OPTIONS.map((option) => option.value);
    expect(values.indexOf("benefit")).toBe(values.indexOf("cash") + 1);
    expect(
      ACCOUNT_TYPE_OPTIONS.find((option) => option.value === "benefit"),
    ).toEqual({
      value: "benefit",
      label: "Benefício",
      icon: "utensils-crossed",
      defaultName: "Vale-refeição",
    });
    expect(accountTypeLabel("benefit")).toBe("Benefício");
    expect(accountTypeFromParam("beneficio")).toBe("benefit");
    expect(accountTypeFromParam("benefit")).toBe("benefit");
  });

  it("has its own group, right after Disponível", () => {
    expect(accountGroupOf("benefit")).toBe("benefits");
    expect(ACCOUNT_GROUPS.map((group) => group.label)).toEqual([
      "Disponível",
      "Benefícios",
      "Caixinhas",
      "Investimentos",
      "Cartões de crédito",
    ]);
  });

  it("is yellow, never negative, out of the net worth when created", () => {
    expect(defaultColorFor("benefit")).toBe("cat-4");
    expect(allowsNegativeBalance("benefit")).toBe(false);
    expect(defaultIncludeInNetWorth("benefit")).toBe(false);
    for (const type of finAccountType.enumValues) {
      if (type !== "benefit") expect(defaultIncludeInNetWorth(type)).toBe(true);
    }
  });

  it("says it stays out of the Saldo, like a caixinha", () => {
    expect(netWorthDescription("benefit")).toBe(
      "O saldo entra no patrimônio, mas não no Saldo em contas.",
    );
    expect(netWorthDescription("benefit", false)).toBe(
      "O saldo não entra no patrimônio nem no Saldo em contas.",
    );
  });
});
