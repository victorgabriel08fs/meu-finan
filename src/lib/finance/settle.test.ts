import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type GroupExpense,
  type GroupSettlement,
  groupBalances,
  type MemberNet,
  netFromTotals,
  settleUpPlan,
  transferBetween,
} from "./settle";
import { allocate } from "./split";

const RUNS = { numRuns: 200 };

describe("netFromTotals", () => {
  it("is paid − owed + sent − received", () => {
    expect(
      netFromTotals([
        {
          memberId: "ana",
          paidCents: 90_000,
          owedCents: 62_000,
          sentCents: 0,
          receivedCents: 12_000,
        },
        {
          memberId: "bruno",
          paidCents: 34_000,
          owedCents: 62_000,
          sentCents: 12_000,
          receivedCents: 0,
        },
      ]),
    ).toEqual([
      { memberId: "ana", netCents: 16_000 },
      { memberId: "bruno", netCents: -16_000 },
    ]);
  });

  it("rejects amounts that are not cents", () => {
    expect(() =>
      netFromTotals([
        {
          memberId: "a",
          paidCents: 1.5,
          owedCents: 0,
          sentCents: 0,
          receivedCents: 0,
        },
      ]),
    ).toThrow(RangeError);
  });
});

describe("settleUpPlan", () => {
  it("has the debtor pay the creditor", () => {
    expect(
      settleUpPlan([
        { memberId: "ana", netCents: 12_000 },
        { memberId: "bruno", netCents: -12_000 },
      ]),
    ).toEqual([{ from: "bruno", to: "ana", amountCents: 12_000 }]);
  });

  it("pairs the largest debtor with the largest creditor", () => {
    expect(
      settleUpPlan([
        { memberId: "a", netCents: 5_000 },
        { memberId: "b", netCents: -3_000 },
        { memberId: "c", netCents: -2_000 },
        { memberId: "d", netCents: 0 },
      ]),
    ).toEqual([
      { from: "b", to: "a", amountCents: 3_000 },
      { from: "c", to: "a", amountCents: 2_000 },
    ]);
  });

  it("is empty when everything is settled, and refuses nets that do not close", () => {
    expect(settleUpPlan([{ memberId: "a", netCents: 0 }])).toEqual([]);
    expect(settleUpPlan([])).toEqual([]);
    expect(() => settleUpPlan([{ memberId: "a", netCents: 1 }])).toThrow(
      RangeError,
    );
  });

  it("zeroes every net in at most n − 1 payments", () => {
    const nets = fc
      .array(fc.integer({ min: -10_000_000, max: 10_000_000 }), {
        minLength: 1,
        maxLength: 6,
      })
      .map((values) => {
        const sum = values.reduce((acc, value) => acc + value, 0);
        return [...values, 0 - sum].map(
          (netCents, index): MemberNet => ({ memberId: `m${index}`, netCents }),
        );
      });
    fc.assert(
      fc.property(nets, (list) => {
        const plan = settleUpPlan(list);
        expect(plan.length).toBeLessThanOrEqual(Math.max(0, list.length - 1));
        const after = new Map(list.map((net) => [net.memberId, net.netCents]));
        for (const transfer of plan) {
          expect(transfer.amountCents).toBeGreaterThan(0);
          expect(transfer.from).not.toBe(transfer.to);
          after.set(
            transfer.from,
            (after.get(transfer.from) ?? 0) + transfer.amountCents,
          );
          after.set(
            transfer.to,
            (after.get(transfer.to) ?? 0) - transfer.amountCents,
          );
        }
        for (const value of after.values()) expect(value).toBe(0);
      }),
      RUNS,
    );
  });
});

describe("transferBetween", () => {
  it("reads the plan from one side", () => {
    const plan = [{ from: "bruno", to: "ana", amountCents: 500 }];
    expect(transferBetween(plan, "ana", "bruno")).toBe(500);
    expect(transferBetween(plan, "bruno", "ana")).toBe(-500);
    expect(transferBetween(plan, "ana", "carla")).toBe(0);
  });
});

describe("groupBalances", () => {
  const ids = ["a", "b", "c"];
  const expense = fc
    .record({
      payer: fc.integer({ min: 0, max: 2 }),
      amount: fc.integer({ min: 1, max: 10_000_000 }),
      weights: fc
        .tuple(
          fc.integer({ min: 0, max: 3 }),
          fc.integer({ min: 0, max: 3 }),
          fc.integer({ min: 0, max: 3 }),
        )
        .filter((list) => list.some((weight) => weight > 0)),
    })
    .map(({ payer, amount, weights }): GroupExpense => {
      const parts = allocate(amount, weights);
      return {
        paidBy: ids[payer] ?? "a",
        amountCents: amount,
        shares: ids.map((memberId, index) => ({
          memberId,
          shareCents: parts[index] ?? 0,
        })),
      };
    });
  const settlement = fc
    .record({
      from: fc.integer({ min: 0, max: 2 }),
      offset: fc.integer({ min: 1, max: 2 }),
      amount: fc.integer({ min: 1, max: 1_000_000 }),
    })
    .map(
      ({ from, offset, amount }): GroupSettlement => ({
        from: ids[from] ?? "a",
        to: ids[(from + offset) % 3] ?? "b",
        amountCents: amount,
      }),
    );

  it("sums to zero and matches netFromTotals", () => {
    fc.assert(
      fc.property(
        fc.array(expense, { maxLength: 10 }),
        fc.array(settlement, { maxLength: 5 }),
        (expenses, settlements) => {
          const nets = groupBalances(ids, expenses, settlements);
          expect(nets.reduce((acc, net) => acc + net.netCents, 0)).toBe(0);
          const totals = ids.map((memberId) => ({
            memberId,
            paidCents: expenses
              .filter((item) => item.paidBy === memberId)
              .reduce((acc, item) => acc + item.amountCents, 0),
            owedCents: expenses.reduce(
              (acc, item) =>
                acc +
                (item.shares.find((share) => share.memberId === memberId)
                  ?.shareCents ?? 0),
              0,
            ),
            sentCents: settlements
              .filter((item) => item.from === memberId)
              .reduce((acc, item) => acc + item.amountCents, 0),
            receivedCents: settlements
              .filter((item) => item.to === memberId)
              .reduce((acc, item) => acc + item.amountCents, 0),
          }));
          expect(netFromTotals(totals)).toEqual(nets);
        },
      ),
      RUNS,
    );
  });

  it("adds members it was not told about", () => {
    expect(
      groupBalances(
        ["a"],
        [
          {
            paidBy: "x",
            amountCents: 100,
            shares: [{ memberId: "a", shareCents: 100 }],
          },
        ],
        [],
      ),
    ).toEqual([
      { memberId: "a", netCents: -100 },
      { memberId: "x", netCents: 100 },
    ]);
  });
});
