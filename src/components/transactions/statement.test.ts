import { describe, expect, it } from "vitest";
import { actionErrorMessage } from "./action-result";
import {
  editScopeLock,
  editScopeOptions,
  editScopePrompt,
  groupByDay,
  recurrenceLabel,
  type StatementItem,
  splitScheduled,
  summarize,
  toRowData,
  transferEnds,
} from "./statement-data";
import {
  hasActiveFilters,
  parseStatementParams,
  statementHref,
} from "./statement-params";

const ACCOUNT = "0199E3A0-0000-7000-8000-000000000001";

function item(patch: Partial<StatementItem>): StatementItem {
  return {
    id: crypto.randomUUID(),
    description: "Supermercado",
    amountCents: -6450,
    kind: "expense",
    status: "paid",
    occurredOn: "2026-10-14",
    accountId: "a1",
    accountName: "Conta principal",
    accountType: "checking",
    categoryId: "c1",
    categoryName: "Mercado",
    categoryIcon: "shopping-cart",
    categoryColor: "cat-3",
    transferId: null,
    counterpartName: null,
    installment: null,
    recurring: false,
    recurrence: null,
    notes: null,
    ...patch,
  };
}

describe("edit scope", () => {
  const recurring = item({ recurring: true });
  const installment = (number: number) =>
    item({ installment: { number, count: 6, totalCents: 59_988 } });

  it("offers this, the next ones or all of a recurrence", () => {
    expect(editScopeOptions(recurring).map((option) => option.label)).toEqual([
      "Só este",
      "Este e os próximos",
      "Todos",
    ]);
    expect(editScopePrompt(recurring)).toContain("Os já pagos não mudam");
  });

  it("skips 'the next ones' on the first and last installments", () => {
    expect(
      editScopeOptions(installment(1)).map((option) => option.value),
    ).toEqual(["this", "all"]);
    expect(
      editScopeOptions(installment(3)).map((option) => option.value),
    ).toEqual(["this", "future", "all"]);
    expect(
      editScopeOptions(installment(6)).map((option) => option.value),
    ).toEqual(["this", "all"]);
    expect(editScopePrompt(installment(3))).toMatch(/^Esta é a parcela 3 de 6/);
  });

  it("keeps a new date, or an installment's new amount, to this entry", () => {
    const none = { date: false, amount: false };
    expect(editScopeLock(item({}), { ...none, date: true })).toBeNull();
    expect(editScopeLock(recurring, none)).toBeNull();
    expect(editScopeLock(recurring, { ...none, amount: true })).toBeNull();
    expect(editScopeLock(recurring, { ...none, date: true })).toContain(
      "nova data",
    );
    expect(editScopeLock(installment(2), { ...none, amount: true })).toContain(
      "novo valor",
    );
  });
});

describe("recurrenceLabel", () => {
  const monthly = {
    freq: "monthly",
    interval: 1,
    byMonthDay: 16,
    endOn: null,
  } as const;

  it("says the day of the month", () => {
    expect(recurrenceLabel(monthly, "2026-10-16")).toBe("Todo mês, no dia 16");
    expect(
      recurrenceLabel(
        { ...monthly, interval: 2, byMonthDay: 31 },
        "2026-10-31",
      ),
    ).toBe("A cada 2 meses, no último dia");
  });

  it("names the weekday with the right article", () => {
    const weekly = { ...monthly, freq: "weekly", byMonthDay: null } as const;
    expect(recurrenceLabel(weekly, "2026-10-14")).toBe("Toda quarta");
    expect(recurrenceLabel({ ...weekly, interval: 2 }, "2026-10-17")).toBe(
      "A cada 2 semanas, no sábado",
    );
  });

  it("gives the date of yearly entries and the end when there is one", () => {
    const yearly = { ...monthly, freq: "yearly" } as const;
    expect(recurrenceLabel(yearly, "2026-10-16")).toBe("Todo ano, em 16/out");
    expect(
      recurrenceLabel({ ...monthly, endOn: "2027-03-01" }, "2026-10-16"),
    ).toBe("Todo mês, no dia 16, até 1º de março de 2027");
  });
});

describe("parseStatementParams", () => {
  it("reads every filter", () => {
    expect(
      parseStatementParams({
        mes: "2026-09",
        conta: ACCOUNT,
        categoria: ["0199e3a0-0000-7000-8000-000000000002", "x"],
        tipo: "despesa",
        status: "pendente",
        q: "  farmácia ",
      }),
    ).toEqual({
      month: "2026-09",
      accountId: ACCOUNT.toLowerCase(),
      categoryId: "0199e3a0-0000-7000-8000-000000000002",
      kind: "expense",
      status: "pending",
      q: "farmácia",
    });
  });

  it("ignores malformed values instead of trusting them", () => {
    expect(
      parseStatementParams({
        mes: "2026-13",
        conta: "1; drop table",
        tipo: "outro",
        status: "PAGO",
        q: "x".repeat(80),
      }),
    ).toEqual({
      month: null,
      accountId: null,
      categoryId: null,
      kind: null,
      status: null,
      q: "x".repeat(60),
    });
  });

  it("tells when filters besides the month are on", () => {
    expect(hasActiveFilters(parseStatementParams({ mes: "2026-09" }))).toBe(
      false,
    );
    expect(hasActiveFilters(parseStatementParams({ status: "pago" }))).toBe(
      true,
    );
  });
});

describe("statementHref", () => {
  const none = parseStatementParams({});

  it("drops the current month and empty filters", () => {
    expect(statementHref({ ...none, month: "2026-10" }, "2026-10")).toBe(
      "/extrato",
    );
  });

  it("keeps the filters when switching months", () => {
    expect(
      statementHref(
        { ...none, month: "2026-09", kind: "transfer", q: "pix" },
        "2026-10",
      ),
    ).toBe("/extrato?mes=2026-09&tipo=transferencia&q=pix");
  });
});

describe("splitScheduled", () => {
  it("puts pending entries first, soonest first", () => {
    const later = item({
      id: "p2",
      status: "pending",
      occurredOn: "2026-10-20",
    });
    const sooner = item({
      id: "p1",
      status: "pending",
      occurredOn: "2026-10-16",
    });
    const paid = item({ id: "ok" });
    const { scheduled, settled } = splitScheduled([later, paid, sooner]);
    expect(scheduled.map((entry) => entry.id)).toEqual(["p1", "p2"]);
    expect(settled.map((entry) => entry.id)).toEqual(["ok"]);
  });
});

describe("groupByDay", () => {
  it("groups consecutive days with income − expenses as the total", () => {
    const groups = groupByDay([
      item({ occurredOn: "2026-10-14", amountCents: -6450 }),
      item({ occurredOn: "2026-10-14", amountCents: -2290 }),
      item({
        occurredOn: "2026-10-07",
        kind: "income",
        amountCents: 780_000,
      }),
      item({
        occurredOn: "2026-10-07",
        kind: "transfer",
        amountCents: -100_000,
      }),
      item({ occurredOn: "2026-10-05", kind: "transfer", amountCents: -500 }),
    ]);
    expect(groups.map((group) => [group.date, group.totalCents])).toEqual([
      ["2026-10-14", -8740],
      ["2026-10-07", 780_000],
      ["2026-10-05", undefined],
    ]);
  });
});

describe("summarize", () => {
  it("adds paid and pending flows apart and transfers on their own", () => {
    expect(
      summarize([
        item({ amountCents: -6450 }),
        item({ kind: "income", amountCents: 780_000 }),
        item({ status: "pending", amountCents: -210_000 }),
        item({ kind: "income", status: "pending", amountCents: 65_000 }),
        item({ kind: "transfer", amountCents: -100_000 }),
        item({ kind: "adjustment", amountCents: 1234 }),
      ]),
    ).toEqual({
      incomeCents: 780_000,
      expenseCents: 6450,
      pendingIncomeCents: 65_000,
      pendingExpenseCents: 210_000,
      transferCents: 100_000,
    });
  });
});

describe("transfer rows", () => {
  const outgoing = item({
    kind: "transfer",
    description: "Para Reserva",
    amountCents: -100_000,
    counterpartName: "Reserva",
    categoryName: null,
  });

  it("say where the money left from", () => {
    expect(toRowData(outgoing).subtitle).toBe(
      "Transferência · de Conta principal",
    );
    expect(transferEnds(outgoing)).toEqual({
      from: "Conta principal",
      to: "Reserva",
    });
  });

  it("flip for the incoming leg", () => {
    const incoming = { ...outgoing, amountCents: 100_000 };
    expect(toRowData(incoming).subtitle).toBe(
      "Transferência · para Conta principal",
    );
    expect(transferEnds(incoming)).toEqual({
      from: "Reserva",
      to: "Conta principal",
    });
  });

  it("leave other rows on the default subtitle", () => {
    expect(toRowData(item({})).subtitle).toBeUndefined();
  });
});

describe("actionErrorMessage", () => {
  it("passes server messages through", () => {
    expect(
      actionErrorMessage({ serverError: "Lançamento não encontrado(a)." }),
    ).toBe("Lançamento não encontrado(a).");
  });

  it("uses the first validation message", () => {
    expect(
      actionErrorMessage({
        validationErrors: {
          formErrors: [],
          fieldErrors: { amountCents: ["O valor precisa ser maior que zero."] },
        },
      }),
    ).toBe("O valor precisa ser maior que zero.");
  });

  it("is null on success", () => {
    expect(actionErrorMessage({})).toBeNull();
    expect(actionErrorMessage(undefined)).not.toBeNull();
  });
});
