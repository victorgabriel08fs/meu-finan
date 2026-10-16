import { describe, expect, it } from "vitest";
import { parse } from "@/lib/finance/dates";
import type { InvoiceSummary } from "@/server/domain/cards";
import {
  invoiceForMonth,
  invoiceTabLabel,
  invoiceTabMonths,
  invoiceTiming,
  shiftReferenceMonth,
} from "./invoice-meta";

const today = "2026-10-14";

describe("invoiceTabMonths", () => {
  it("merges the invoices with the current and the selected month, in order", () => {
    expect(
      invoiceTabMonths(["2026-11", "2026-09"], "2026-10", "2026-10"),
    ).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(invoiceTabMonths([], "2026-10", "2027-01")).toEqual([
      "2026-10",
      "2027-01",
    ]);
  });
});

describe("invoiceTabLabel", () => {
  it("adds the year only outside the current one", () => {
    expect(invoiceTabLabel("2026-10", "2026-10")).toBe("out");
    expect(invoiceTabLabel("2027-01", "2026-10")).toBe("jan/27");
  });
});

describe("shiftReferenceMonth", () => {
  it("crosses years", () => {
    expect(shiftReferenceMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftReferenceMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("invoiceForMonth", () => {
  const cycle = { closingDay: 17, dueDay: 25 };
  const stored: InvoiceSummary = {
    id: "inv-1",
    referenceMonth: "2026-10",
    closingDate: "2026-10-17",
    dueDate: "2026-10-25",
    totalCents: 138_042,
    paidCents: 0,
    outstandingCents: 138_042,
    status: "open",
    purchases: 12,
  };

  it("returns the stored invoice", () => {
    expect(invoiceForMonth("2026-10", [stored], cycle, parse(today))).toBe(
      stored,
    );
  });

  it("builds an empty invoice with the cycle dates", () => {
    expect(invoiceForMonth("2026-11", [stored], cycle, parse(today))).toEqual({
      id: null,
      referenceMonth: "2026-11",
      closingDate: "2026-11-17",
      dueDate: "2026-11-25",
      totalCents: 0,
      paidCents: 0,
      outstandingCents: 0,
      status: "open",
      purchases: 0,
    });
  });

  it("closes in the previous month when the due day comes first", () => {
    const view = invoiceForMonth(
      "2026-11",
      [],
      { closingDay: 28, dueDay: 5 },
      parse(today),
    );
    expect(view.closingDate).toBe("2026-10-28");
    expect(view.dueDate).toBe("2026-11-05");
  });
});

describe("invoiceTiming", () => {
  const dates = { closingDate: "2026-10-17", dueDate: "2026-10-25" };

  it("counts down to the closing date while open", () => {
    expect(invoiceTiming({ ...dates, status: "open" }, today)).toBe(
      "Fecha em 3 dias",
    );
    expect(invoiceTiming({ ...dates, status: "open" }, "2026-10-16")).toBe(
      "Fecha amanhã",
    );
  });

  it("counts down to the due date once closed", () => {
    expect(invoiceTiming({ ...dates, status: "closed" }, "2026-10-20")).toBe(
      "Vence em 5 dias",
    );
    expect(invoiceTiming({ ...dates, status: "closed" }, "2026-10-24")).toBe(
      "Vence amanhã",
    );
    expect(invoiceTiming({ ...dates, status: "closed" }, "2026-10-25")).toBe(
      "Vence hoje",
    );
  });

  it("says how late an overdue invoice is", () => {
    expect(invoiceTiming({ ...dates, status: "overdue" }, "2026-10-26")).toBe(
      "Venceu ontem",
    );
    expect(invoiceTiming({ ...dates, status: "overdue" }, "2026-10-30")).toBe(
      "Venceu há 5 dias",
    );
    expect(invoiceTiming({ ...dates, status: "paid" }, "2026-10-30")).toBe(
      "Fatura paga",
    );
  });
});
