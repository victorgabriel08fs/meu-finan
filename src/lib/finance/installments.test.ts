import { describe, expect, it } from "vitest";
import { iso, isoMonth, parse } from "./dates";
import { installmentSchedule, splitInstallments } from "./installments";

describe("splitInstallments", () => {
  it("gives the remainder to the first installment", () => {
    expect(splitInstallments(10_000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(59_988, 6)).toEqual(Array(6).fill(9998));
    expect(splitInstallments(100, 1)).toEqual([100]);
    expect(splitInstallments(5, 12)).toEqual([5, ...Array(11).fill(0)]);
  });

  it("keeps the sign of a negative total (ledger expense)", () => {
    expect(splitInstallments(-10_000, 3)).toEqual([-3334, -3333, -3333]);
    const zeros = splitInstallments(-2, 3).slice(1);
    expect(zeros.every((value) => Object.is(value, 0))).toBe(true);
  });

  it("splits zero into zeros", () => {
    expect(splitInstallments(0, 3)).toEqual([0, 0, 0]);
  });

  it("rejects invalid input", () => {
    expect(() => splitInstallments(100.5, 2)).toThrow(RangeError);
    expect(() => splitInstallments(100, 0)).toThrow(RangeError);
    expect(() => splitInstallments(100, 1.5)).toThrow(RangeError);
    expect(() => splitInstallments(100, 1000)).toThrow(RangeError);
  });
});

describe("installmentSchedule", () => {
  it("dates each installment from the original purchase day", () => {
    const schedule = installmentSchedule(parse("2026-08-31"), 60_000, 6);
    expect(schedule.map((item) => iso(item.occurredOn))).toEqual([
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
      "2027-01-31",
    ]);
    expect(schedule.map((item) => item.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(schedule.every((item) => item.invoiceMonth === null)).toBe(true);
    expect(schedule.every((item) => item.amountCents === 10_000)).toBe(true);
  });

  it("puts installments on consecutive invoices starting at the purchase's", () => {
    // Bought on the closing day: the first installment goes to the next invoice.
    const schedule = installmentSchedule(parse("2026-10-17"), -10_000, 3, {
      closingDay: 17,
      dueDay: 25,
    });
    expect(
      schedule.map((item) => item.invoiceMonth && isoMonth(item.invoiceMonth)),
    ).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(schedule.map((item) => item.amountCents)).toEqual([
      -3334, -3333, -3333,
    ]);
  });

  it("handles leap days", () => {
    const schedule = installmentSchedule(parse("2024-02-29"), 1200, 13);
    expect(iso(schedule[12].occurredOn)).toBe("2025-02-28");
    expect(iso(schedule[1].occurredOn)).toBe("2024-03-29");
  });

  it("rejects invalid input", () => {
    expect(() =>
      installmentSchedule({ year: 2026, month: 2, day: 30 }, 100, 2),
    ).toThrow(RangeError);
    expect(() =>
      installmentSchedule(parse("2026-10-14"), 100, 2, {
        closingDay: 0,
        dueDay: 10,
      }),
    ).toThrow(RangeError);
  });
});
