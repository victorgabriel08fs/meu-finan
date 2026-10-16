import { describe, expect, it } from "vitest";
import { emptyDraft, type QuickAddDraft } from "@/stores/quick-add";
import {
  buildEntry,
  effectivePaid,
  installmentPreview,
  invoiceHint,
  localDays,
  savedMessage,
  statusLabel,
} from "./entry";

const TODAY = "2026-10-14";
const ACCOUNT = "0199e3a0-0000-7000-8000-000000000001";
const OTHER = "0199e3a0-0000-7000-8000-000000000002";
const CATEGORY = "0199e3a0-0000-7000-8000-000000000003";
const REQUEST = "0199e3a0-0000-7000-8000-0000000000ff";

const context = {
  today: TODAY,
  defaultAccountId: ACCOUNT,
  requestId: REQUEST,
};

/** "R$ 64,50" with the no-break space formatBRL puts after the symbol. */
const brl = (text: string) => text.replace("R$ ", "R$ ");

function draft(patch: Partial<QuickAddDraft> = {}): QuickAddDraft {
  return { ...emptyDraft(), expression: "64,5", ...patch };
}

describe("localDays", () => {
  it("reads the calendar day in the user's time zone", () => {
    // 2026-10-15 01:30 UTC is still the 14th in São Paulo (UTC−3).
    const instant = Date.UTC(2026, 9, 15, 1, 30);
    expect(localDays(instant, "America/Sao_Paulo")).toEqual({
      today: "2026-10-14",
      yesterday: "2026-10-13",
    });
  });
});

describe("status", () => {
  it("is paid up to today and scheduled after it", () => {
    expect(effectivePaid(null, TODAY, TODAY)).toBe(true);
    expect(effectivePaid(null, "2026-10-15", TODAY)).toBe(false);
    expect(effectivePaid(true, "2026-10-15", TODAY)).toBe(true);
    expect(effectivePaid(false, TODAY, TODAY)).toBe(false);
  });

  it("names the status", () => {
    expect(statusLabel(true, TODAY, TODAY)).toBe("Pago");
    expect(statusLabel(false, "2026-10-20", TODAY)).toBe("Agendado");
    expect(statusLabel(false, TODAY, TODAY)).toBe("Pendente");
  });
});

describe("invoiceHint", () => {
  const card = { closingDay: 5, dueDay: 12 };

  it("names the invoice month of a card purchase", () => {
    expect(invoiceHint("2026-10-04", card)).toBe("Entra na fatura de outubro");
    expect(invoiceHint("2026-10-05", card)).toBe("Entra na fatura de novembro");
  });

  it("adds the year when the invoice falls in another one", () => {
    expect(invoiceHint("2026-12-20", card)).toBe(
      "Entra na fatura de janeiro de 2027",
    );
  });

  it("gives up on an invalid cycle", () => {
    expect(invoiceHint(TODAY, { closingDay: 0, dueDay: 40 })).toBeNull();
  });
});

describe("installmentPreview", () => {
  it("shows the installment and the first one when cents are left over", () => {
    expect(installmentPreview(59_990, 6)).toEqual({
      each: brl("6x de R$ 99,98"),
      first: brl("1ª parcela R$ 100,00"),
    });
    expect(installmentPreview(60_000, 6)).toEqual({
      each: brl("6x de R$ 100,00"),
      first: null,
    });
  });

  it("is empty for amounts that cannot be split", () => {
    expect(installmentPreview(5, 6)).toBeNull();
    expect(installmentPreview(10_000, 1)).toBeNull();
  });
});

describe("savedMessage", () => {
  it("follows the toast copy of doc 02 §10.3", () => {
    expect(savedMessage("expense", 6450)).toBe(
      brl("Despesa de R$ 64,50 salva"),
    );
    expect(savedMessage("income", 780_000)).toBe(
      brl("Receita de R$ 7.800,00 salva"),
    );
    expect(savedMessage("transfer", 100_000)).toBe(
      brl("Transferência de R$ 1.000,00 feita"),
    );
    expect(savedMessage("expense", 59_988, { installments: 6 })).toBe(
      brl("Despesa de R$ 599,88 salva em 6x"),
    );
    expect(savedMessage("expense", 210_000, { scheduled: true })).toBe(
      brl("Despesa de R$ 2.100,00 agendada"),
    );
  });
});

describe("buildEntry", () => {
  it("builds an expense with the defaults", () => {
    expect(buildEntry(draft({ expenseCategoryId: CATEGORY }), context)).toEqual(
      {
        ok: true,
        amountCents: 6450,
        scheduled: false,
        payload: {
          kind: "expense",
          id: REQUEST,
          amountCents: 6450,
          accountId: ACCOUNT,
          categoryId: CATEGORY,
          description: undefined,
          notes: null,
          occurredOn: TODAY,
          paid: undefined,
          installments: null,
          recurrence: null,
        },
      },
    );
  });

  it("resolves the calculator expression", () => {
    const result = buildEntry(draft({ expression: "120+35,5" }), context);
    expect(result.ok && result.amountCents).toBe(15_550);
  });

  it("asks for a positive amount", () => {
    expect(buildEntry(draft({ expression: "" }), context)).toMatchObject({
      ok: false,
      field: "amount",
      message: "Digite um valor",
    });
    expect(buildEntry(draft({ expression: "50−80" }), context)).toMatchObject({
      ok: false,
      message: "O valor precisa ser maior que zero",
    });
  });

  it("asks for an account", () => {
    expect(
      buildEntry(draft(), { ...context, defaultAccountId: null }),
    ).toMatchObject({ ok: false, field: "account" });
  });

  it("keeps the category of the chosen kind", () => {
    const result = buildEntry(
      draft({ kind: "income", expenseCategoryId: CATEGORY }),
      context,
    );
    expect(result.ok && result.payload).toMatchObject({
      kind: "income",
      categoryId: null,
    });
  });

  it("schedules future entries unless marked as paid", () => {
    expect(buildEntry(draft({ date: "2026-10-20" }), context)).toMatchObject({
      ok: true,
      scheduled: true,
    });
    expect(
      buildEntry(draft({ date: "2026-10-20", paid: true }), context),
    ).toMatchObject({ ok: true, scheduled: false, payload: { paid: true } });
  });

  it("sends installments for expenses only and never with a repetition", () => {
    const expense = buildEntry(
      draft({ installments: 6, repeat: "monthly" }),
      context,
    );
    expect(expense.ok && expense.payload).toMatchObject({
      installments: 6,
      recurrence: null,
    });
    const income = buildEntry(
      draft({ kind: "income", installments: 6 }),
      context,
    );
    expect(income.ok && income.payload).toMatchObject({ installments: null });
    expect(
      buildEntry(draft({ expression: "0,05", installments: 6 }), context),
    ).toMatchObject({ ok: false, field: "options" });
  });

  it("sends the repetition with its end", () => {
    const result = buildEntry(
      draft({ repeat: "monthly", repeatEndOn: "2027-10-14" }),
      context,
    );
    expect(result.ok && result.payload).toMatchObject({
      recurrence: { freq: "monthly", endOn: "2027-10-14" },
    });
    expect(
      buildEntry(
        draft({ repeat: "weekly", repeatEndOn: "2026-10-01" }),
        context,
      ),
    ).toMatchObject({ ok: false, field: "options" });
  });

  it("builds a transfer between two different accounts", () => {
    expect(
      buildEntry(
        draft({
          kind: "transfer",
          toAccountId: OTHER,
          description: " Reserva ",
        }),
        context,
      ),
    ).toEqual({
      ok: true,
      amountCents: 6450,
      scheduled: false,
      payload: {
        kind: "transfer",
        id: REQUEST,
        amountCents: 6450,
        fromAccountId: ACCOUNT,
        toAccountId: OTHER,
        description: "Reserva",
        occurredOn: TODAY,
        paid: undefined,
      },
    });
    expect(buildEntry(draft({ kind: "transfer" }), context)).toMatchObject({
      ok: false,
      field: "toAccount",
    });
    expect(
      buildEntry(draft({ kind: "transfer", toAccountId: ACCOUNT }), context),
    ).toMatchObject({ ok: false, field: "toAccount" });
  });
});
