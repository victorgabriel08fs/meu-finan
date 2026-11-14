import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type InstallmentRow,
  summarizeInstallmentPlans,
} from "./installments-ending";

function row(over: Partial<InstallmentRow>): InstallmentRow {
  return {
    planId: "p1",
    description: "Notebook",
    count: 6,
    accountId: "a1",
    accountName: "Cartão",
    number: 1,
    amountCents: -10000,
    occurredOn: "2026-11-10",
    ...over,
  };
}

describe("summarizeInstallmentPlans", () => {
  it("returns nothing without rows", () => {
    expect(summarizeInstallmentPlans([], 3)).toEqual({
      items: [],
      totalPlans: 0,
      monthlyCents: 0,
    });
  });

  it("sums the remainder, finds the next and the last installment", () => {
    const { items, monthlyCents } = summarizeInstallmentPlans(
      [
        row({ number: 5, occurredOn: "2027-03-10", amountCents: -3000 }),
        row({ number: 3, occurredOn: "2027-01-10", amountCents: -2000 }),
        row({ number: 4, occurredOn: "2027-02-10", amountCents: -2000 }),
      ],
      3,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      remainingCents: 7000,
      remainingCount: 3,
      nextNumber: 3,
      nextOn: "2027-01-10",
      nextAmountCents: 2000,
      endsOn: "2027-03-10",
    });
    expect(monthlyCents).toBe(2000);
  });

  it("orders by the plan that ends first, then the smaller remainder", () => {
    const { items } = summarizeInstallmentPlans(
      [
        row({ planId: "c", occurredOn: "2027-05-10" }),
        row({ planId: "b", occurredOn: "2027-01-10", amountCents: -9000 }),
        row({ planId: "a", occurredOn: "2027-01-10", amountCents: -5000 }),
      ],
      2,
    );
    expect(items.map((i) => i.planId)).toEqual(["a", "b"]);
  });

  it("cuts the items but not the totals", () => {
    const rows = ["a", "b", "c", "d"].map((planId, i) =>
      row({ planId, occurredOn: `2027-0${i + 1}-10` }),
    );
    const summary = summarizeInstallmentPlans(rows, 3);
    expect(summary.items).toHaveLength(3);
    expect(summary.totalPlans).toBe(4);
    expect(summary.monthlyCents).toBe(40000);
  });

  it("keeps the sums of the rows (property)", () => {
    const rowArb = fc.record({
      planId: fc.constantFrom("a", "b", "c"),
      number: fc.integer({ min: 1, max: 12 }),
      amountCents: fc.integer({ min: -100000, max: -1 }),
      occurredOn: fc.constantFrom("2027-01-10", "2027-02-10", "2027-03-10"),
    });
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 30 }), (partials) => {
        const rows = partials.map((p) => row(p));
        const { items, monthlyCents, totalPlans } = summarizeInstallmentPlans(
          rows,
          100,
        );
        const total = rows.reduce((s, r) => s - r.amountCents, 0);
        expect(items.reduce((s, i) => s + i.remainingCents, 0)).toBe(total);
        expect(items.reduce((s, i) => s + i.remainingCount, 0)).toBe(
          rows.length,
        );
        expect(items.reduce((s, i) => s + i.nextAmountCents, 0)).toBe(
          monthlyCents,
        );
        expect(totalPlans).toBe(items.length);
      }),
    );
  });
});
