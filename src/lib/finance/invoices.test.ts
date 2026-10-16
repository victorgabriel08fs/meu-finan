import { describe, expect, it } from "vitest";
import { iso, parse } from "./dates";
import {
  type CardCycle,
  invoiceFor,
  invoiceForReferenceMonth,
  invoiceOutstandingCents,
  invoiceStatus,
  isValidCardCycle,
} from "./invoices";

const D = parse;
const dates = (purchase: string, card: CardCycle) => {
  const invoice = invoiceFor(D(purchase), card);
  return [iso(invoice.closingDate), iso(invoice.dueDate)];
};

describe("isValidCardCycle", () => {
  it("accepts days 1–31 with the due date after the closing date", () => {
    expect(isValidCardCycle({ closingDay: 17, dueDay: 25 })).toBe(true);
    expect(isValidCardCycle({ closingDay: 28, dueDay: 5 })).toBe(true);
    expect(isValidCardCycle({ closingDay: 31, dueDay: 10 })).toBe(true);
    expect(isValidCardCycle({ closingDay: 10, dueDay: 10 })).toBe(true);
    expect(isValidCardCycle({ closingDay: 27, dueDay: 31 })).toBe(true);
  });

  it("rejects same-month due days that would clamp onto the closing day", () => {
    // Closing 28 / due 30: both become 28/fev in common years.
    expect(isValidCardCycle({ closingDay: 28, dueDay: 30 })).toBe(false);
    expect(isValidCardCycle({ closingDay: 30, dueDay: 31 })).toBe(false);
  });

  it("rejects malformed cycles", () => {
    expect(isValidCardCycle({ closingDay: 0, dueDay: 10 })).toBe(false);
    expect(isValidCardCycle({ closingDay: 10, dueDay: 32 })).toBe(false);
    expect(isValidCardCycle({ closingDay: 10.5, dueDay: 20 })).toBe(false);
    expect(isValidCardCycle(null as unknown as CardCycle)).toBe(false);
    expect(isValidCardCycle("17/25" as unknown as CardCycle)).toBe(false);
  });
});

describe("invoiceFor", () => {
  it("closing on the 31st clamps to short months, leap years included", () => {
    const card = { closingDay: 31, dueDay: 10 };
    expect(dates("2026-04-29", card)).toEqual(["2026-04-30", "2026-05-10"]);
    expect(dates("2026-04-30", card)).toEqual(["2026-05-31", "2026-06-10"]);
    expect(dates("2024-02-28", card)).toEqual(["2024-02-29", "2024-03-10"]);
    expect(dates("2024-02-29", card)).toEqual(["2024-03-31", "2024-04-10"]);
    expect(dates("2026-12-31", card)).toEqual(["2027-01-31", "2027-02-10"]);
  });

  it("due day 31 clamps too (closing 20, due 31 → 28/fev)", () => {
    expect(dates("2026-02-10", { closingDay: 20, dueDay: 31 })).toEqual([
      "2026-02-20",
      "2026-02-28",
    ]);
  });

  it("rejects invalid input", () => {
    expect(() =>
      invoiceFor(D("2026-10-14"), { closingDay: 28, dueDay: 30 }),
    ).toThrow(/card must have closingDay and dueDay/);
    expect(() =>
      invoiceFor(
        { year: 2026, month: 2, day: 29 },
        { closingDay: 1, dueDay: 9 },
      ),
    ).toThrow(/purchase/);
  });
});

describe("invoiceForReferenceMonth", () => {
  it("rebuilds the invoice due in a month", () => {
    const sameMonth = invoiceForReferenceMonth(
      { year: 2026, month: 10 },
      { closingDay: 17, dueDay: 25 },
    );
    expect([iso(sameMonth.closingDate), iso(sameMonth.dueDate)]).toEqual([
      "2026-10-17",
      "2026-10-25",
    ]);
    const nextMonth = invoiceForReferenceMonth(
      { year: 2026, month: 1 },
      { closingDay: 28, dueDay: 5 },
    );
    expect([iso(nextMonth.closingDate), iso(nextMonth.dueDate)]).toEqual([
      "2025-12-28",
      "2026-01-05",
    ]);
    expect(nextMonth.referenceMonth).toEqual({ year: 2026, month: 1 });
  });

  it("rejects invalid input", () => {
    expect(() =>
      invoiceForReferenceMonth(
        { year: 2026, month: 13 },
        {
          closingDay: 17,
          dueDay: 25,
        },
      ),
    ).toThrow(RangeError);
  });
});

describe("invoiceStatus", () => {
  const invoice = {
    closingDate: D("2026-10-17"),
    dueDate: D("2026-10-25"),
    totalCents: 138_042,
  };
  const status = (today: string, paidCents = 0) =>
    invoiceStatus({ ...invoice, paidCents, today: D(today) });

  it("is open before the closing date, even if paid in advance", () => {
    expect(status("2026-10-16")).toBe("open");
    expect(status("2026-10-16", 138_042)).toBe("open");
  });

  it("is closed from the closing date to the due date while unpaid", () => {
    expect(status("2026-10-17")).toBe("closed");
    expect(status("2026-10-25")).toBe("closed");
    expect(status("2026-10-20", 100_000)).toBe("closed");
  });

  it("is paid once payments cover the total", () => {
    expect(status("2026-10-20", 138_042)).toBe("paid");
    expect(status("2026-11-30", 140_000)).toBe("paid");
  });

  it("is overdue after the due date while unpaid", () => {
    expect(status("2026-10-26")).toBe("overdue");
    expect(status("2026-10-26", 138_041)).toBe("overdue");
  });

  it("rejects invalid input", () => {
    expect(() =>
      invoiceStatus({
        ...invoice,
        dueDate: D("2026-10-17"),
        paidCents: 0,
        today: D("2026-10-14"),
      }),
    ).toThrow(/dueDate must be after closingDate/);
    expect(() =>
      invoiceStatus({ ...invoice, paidCents: 0.5, today: D("2026-10-14") }),
    ).toThrow(RangeError);
    expect(() =>
      invoiceStatus({
        ...invoice,
        totalCents: Number.NaN,
        paidCents: 0,
        today: D("2026-10-14"),
      }),
    ).toThrow(RangeError);
  });
});

describe("invoiceOutstandingCents", () => {
  it("is what is still owed, never negative", () => {
    expect(invoiceOutstandingCents(138_042, 0)).toBe(138_042);
    expect(invoiceOutstandingCents(138_042, 38_042)).toBe(100_000);
    expect(invoiceOutstandingCents(138_042, 200_000)).toBe(0);
    expect(() => invoiceOutstandingCents(1.5, 0)).toThrow(RangeError);
    expect(() => invoiceOutstandingCents(1, 0.5)).toThrow(RangeError);
  });
});
