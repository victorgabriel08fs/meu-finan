import { describe, expect, it } from "vitest";
import { parse } from "./dates";
import {
  type ForecastInput,
  forecastBalance,
  type MonthTotals,
  savingsRate,
} from "./forecast";

const D = parse;

describe("forecastBalance (saldo previsto)", () => {
  // Doc 03 §12, mockups on 14/out: 27.670,15 − 2.100,00 − 119,90 − 1.380,42 + 650,00.
  const mockup: ForecastInput = {
    balanceCents: 2_767_015,
    pending: [
      { amountCents: -210_000, occurredOn: D("2026-10-20") },
      { amountCents: -11_990, occurredOn: D("2026-10-22") },
      { amountCents: 65_000, occurredOn: D("2026-10-28") },
    ],
    invoices: [{ dueDate: D("2026-10-25"), totalCents: 138_042, paidCents: 0 }],
    until: D("2026-10-31"),
  };

  it("matches the mockup: previsto R$ 24.719,83", () => {
    expect(forecastBalance(mockup)).toEqual({
      balanceCents: 2_767_015,
      pendingIncomeCents: 65_000,
      pendingExpenseCents: 221_990,
      invoicesDueCents: 138_042,
      forecastCents: 2_471_983,
    });
  });

  it("does not count card purchases or invoice payments twice", () => {
    const result = forecastBalance({
      ...mockup,
      pending: [
        ...mockup.pending,
        { amountCents: -8740, occurredOn: D("2026-10-15"), onCreditCard: true },
        {
          amountCents: -138_042,
          occurredOn: D("2026-10-25"),
          paysInvoice: true,
        },
      ],
    });
    expect(result.forecastCents).toBe(2_471_983);
  });

  it("only counts entries and invoices due up to `until`, overdue ones included", () => {
    const result = forecastBalance({
      ...mockup,
      pending: [
        ...mockup.pending,
        { amountCents: -5000, occurredOn: D("2026-11-01") },
        { amountCents: 9000, occurredOn: D("2026-11-05") },
        { amountCents: -1000, occurredOn: D("2026-09-30") },
      ],
      invoices: [
        ...mockup.invoices,
        { dueDate: D("2026-11-25"), totalCents: 50_000, paidCents: 0 },
        { dueDate: D("2026-09-25"), totalCents: 20_000, paidCents: 15_000 },
      ],
    });
    expect(result.pendingExpenseCents).toBe(222_990);
    expect(result.pendingIncomeCents).toBe(65_000);
    expect(result.invoicesDueCents).toBe(143_042);
  });

  it("an overpaid invoice owes nothing (it does not add money)", () => {
    const result = forecastBalance({
      ...mockup,
      invoices: [
        { dueDate: D("2026-10-25"), totalCents: 1000, paidCents: 5000 },
      ],
    });
    expect(result.invoicesDueCents).toBe(0);
  });

  it("with nothing pending, the forecast is the balance", () => {
    expect(
      forecastBalance({ ...mockup, pending: [], invoices: [] }).forecastCents,
    ).toBe(2_767_015);
  });

  it("rejects invalid input", () => {
    expect(() => forecastBalance({ ...mockup, balanceCents: 0.5 })).toThrow(
      RangeError,
    );
    expect(() =>
      forecastBalance({ ...mockup, until: { year: 2026, month: 2, day: 30 } }),
    ).toThrow(RangeError);
    expect(() =>
      forecastBalance({
        ...mockup,
        pending: [{ amountCents: 1.5, occurredOn: D("2026-10-20") }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      forecastBalance({
        ...mockup,
        pending: [
          { amountCents: 100, occurredOn: { year: 2026, month: 13, day: 1 } },
        ],
      }),
    ).toThrow(RangeError);
    expect(() =>
      forecastBalance({
        ...mockup,
        invoices: [{ dueDate: D("2026-10-25"), totalCents: 0.5, paidCents: 0 }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      forecastBalance({
        ...mockup,
        balanceCents: Number.MAX_SAFE_INTEGER,
        invoices: [],
        pending: [{ amountCents: 65_000, occurredOn: D("2026-10-28") }],
      }),
    ).toThrow(/forecast/);
  });
});

describe("savingsRate (taxa de poupança)", () => {
  const month = (
    year: number,
    m: number,
    income: number,
    expense: number,
  ): MonthTotals => ({
    month: { year, month: m },
    incomeCents: income,
    expenseCents: expense,
  });

  it("only counts complete months: the current (partial) month is left out", () => {
    const result = savingsRate({
      currentMonth: { year: 2026, month: 10 },
      months: [
        month(2026, 8, 800_000, 600_000),
        month(2026, 9, 800_000, 560_000),
        // Salary in, bills still to come: would inflate the rate.
        month(2026, 10, 800_000, 100_000),
        month(2026, 11, 0, 50_000),
      ],
    });
    expect(result).toEqual({
      rate: 0.275,
      incomeCents: 1_600_000,
      expenseCents: 1_160_000,
      monthsCounted: 2,
      from: { year: 2026, month: 8 },
      to: { year: 2026, month: 9 },
    });
  });

  it("finds the first and last months whatever the input order", () => {
    const result = savingsRate({
      currentMonth: { year: 2026, month: 10 },
      months: [
        month(2026, 9, 100, 50),
        month(2025, 11, 100, 50),
        month(2026, 3, 100, 50),
      ],
    });
    expect(result.from).toEqual({ year: 2025, month: 11 });
    expect(result.to).toEqual({ year: 2026, month: 9 });
    expect(result.rate).toBe(0.5);
  });

  it("can be negative, and is null without income", () => {
    expect(
      savingsRate({
        currentMonth: { year: 2026, month: 10 },
        months: [month(2026, 9, 100_000, 150_000)],
      }).rate,
    ).toBe(-0.5);
    expect(
      savingsRate({
        currentMonth: { year: 2026, month: 10 },
        months: [month(2026, 9, 0, 150_000)],
      }).rate,
    ).toBeNull();
    expect(
      savingsRate({ currentMonth: { year: 2026, month: 10 }, months: [] }),
    ).toEqual({
      rate: null,
      incomeCents: 0,
      expenseCents: 0,
      monthsCounted: 0,
      from: null,
      to: null,
    });
  });

  it("rejects invalid input", () => {
    const currentMonth = { year: 2026, month: 10 };
    expect(() =>
      savingsRate({ currentMonth: { year: 2026, month: 0 }, months: [] }),
    ).toThrow(RangeError);
    expect(() =>
      savingsRate({ currentMonth, months: [month(2026, 13, 1, 1)] }),
    ).toThrow(RangeError);
    expect(() =>
      savingsRate({ currentMonth, months: [month(2026, 9, 1.5, 1)] }),
    ).toThrow(RangeError);
    expect(() =>
      savingsRate({ currentMonth, months: [month(2026, 9, 1, Number.NaN)] }),
    ).toThrow(RangeError);
  });
});
