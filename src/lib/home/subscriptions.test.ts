import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type PredecessorRule,
  predecessorOf,
  type SubscriptionOccurrence,
  type SubscriptionRule,
  summarizeSubscriptions,
} from "./subscriptions";

const rule = (over: Partial<SubscriptionRule> = {}): SubscriptionRule => ({
  id: "r1",
  description: "Streaming",
  accountId: "a1",
  accountName: "Conta",
  amountCents: -4490,
  byMonthDay: null,
  startOn: "2026-01-10",
  endOn: null,
  generatedUntil: "2026-12-10",
  ...over,
});
const occ = (
  recurrenceId: string,
  occurredOn: string,
  amountCents = -4490,
  status: "paid" | "pending" = "pending",
): SubscriptionOccurrence => ({
  recurrenceId,
  amountCents,
  occurredOn,
  status,
});
const base = {
  todayIso: "2026-10-14",
  periodStartIso: "2026-10-01",
  limit: 5,
};

describe("summarizeSubscriptions", () => {
  it("returns zeros without rules", () => {
    expect(
      summarizeSubscriptions({
        ...base,
        rules: [],
        predecessors: [],
        occurrences: [],
      }),
    ).toEqual({
      items: [],
      totalCount: 0,
      monthlyCents: 0,
      increasedCount: 0,
      hiddenIncreasedCount: 0,
    });
  });

  it("takes the next undeleted debit, and today's only while pending", () => {
    const r = [rule()];
    const paidToday = summarizeSubscriptions({
      ...base,
      rules: r,
      predecessors: [],
      occurrences: [
        occ("r1", "2026-10-14", -4490, "paid"),
        occ("r1", "2026-11-14", -5000),
      ],
    });
    expect(paidToday.items[0]).toMatchObject({
      nextOn: "2026-11-14",
      amountCents: 5000,
    });
    const pendingToday = summarizeSubscriptions({
      ...base,
      rules: r,
      predecessors: [],
      occurrences: [occ("r1", "2026-10-14"), occ("r1", "2026-11-14")],
    });
    expect(pendingToday.items[0]?.nextOn).toBe("2026-10-14");
  });

  it("projects past generated_until, and drops a finished series", () => {
    const projected = summarizeSubscriptions({
      ...base,
      rules: [rule({ generatedUntil: "2026-10-14" })],
      predecessors: [],
      occurrences: [],
    });
    expect(projected.items[0]?.nextOn).toBe("2026-11-10");
    const ended = summarizeSubscriptions({
      ...base,
      rules: [rule({ generatedUntil: "2026-10-14", endOn: "2026-10-20" })],
      predecessors: [],
      occurrences: [],
    });
    expect(ended.totalCount).toBe(0);
  });

  it("starts a future rule at its first day", () => {
    const s = summarizeSubscriptions({
      ...base,
      rules: [rule({ startOn: "2026-11-03", generatedUntil: "2026-10-01" })],
      predecessors: [],
      occurrences: [],
    });
    expect(s.items[0]?.nextOn).toBe("2026-11-03");
  });

  it("flags an increase over the last debit before the financial month", () => {
    const s = summarizeSubscriptions({
      ...base,
      periodStartIso: "2026-10-05",
      rules: [rule()],
      predecessors: [],
      occurrences: [
        occ("r1", "2026-09-10", -4490),
        occ("r1", "2026-10-02", -4000), // last before the month: the reference
        occ("r1", "2026-10-10", -4300), // inside the month: ignored
        occ("r1", "2026-11-10", -4990),
      ],
    });
    expect(s.items[0]).toMatchObject({
      nextOn: "2026-11-10",
      previousCents: 4000,
      increaseCents: 990,
    });
  });

  it("has no increase for a drop, or without a reference", () => {
    const drop = summarizeSubscriptions({
      ...base,
      rules: [rule()],
      predecessors: [],
      occurrences: [occ("r1", "2026-09-10", -5000), occ("r1", "2026-11-10")],
    });
    expect(drop.items[0]?.increaseCents).toBe(0);
    const fresh = summarizeSubscriptions({
      ...base,
      rules: [rule()],
      predecessors: [],
      occurrences: [occ("r1", "2026-11-10")],
    });
    expect(fresh.items[0]).toMatchObject({
      previousCents: null,
      increaseCents: 0,
    });
  });

  it("follows the series through the predecessor", () => {
    const s = summarizeSubscriptions({
      ...base,
      rules: [rule({ id: "r2", startOn: "2026-11-10" })],
      predecessors: [
        {
          id: "r1",
          description: "Streaming",
          byMonthDay: null,
          endOn: "2026-11-09",
        },
      ],
      occurrences: [
        occ("r1", "2026-09-10", -4490),
        occ("r2", "2026-11-10", -4990),
      ],
    });
    expect(s.items[0]).toMatchObject({
      previousCents: 4490,
      increaseCents: 500,
    });
  });

  it("cuts at the limit but counts everything", () => {
    const rules = [1, 2, 3].map((n) =>
      rule({ id: `r${n}`, amountCents: -1000 * n }),
    );
    const s = summarizeSubscriptions({
      ...base,
      limit: 2,
      rules,
      predecessors: [],
      occurrences: [
        occ("r1", "2026-09-10", -500),
        occ("r1", "2026-11-10", -1000),
        occ("r2", "2026-11-10", -2000),
        occ("r3", "2026-09-10", -1000),
        occ("r3", "2026-11-10", -3000),
      ],
    });
    expect(s.items.map((i) => i.recurrenceId)).toEqual(["r3", "r2"]);
    expect(s).toMatchObject({
      totalCount: 3,
      monthlyCents: 6000,
      increasedCount: 2,
      hiddenIncreasedCount: 1,
    });
  });
});

describe("predecessorOf", () => {
  const cand = (over: Partial<PredecessorRule>): PredecessorRule => ({
    id: "p1",
    description: "Streaming",
    byMonthDay: null,
    endOn: "2026-11-09",
    ...over,
  });
  const r = rule({ id: "r2", startOn: "2026-11-10" });

  it("matches by end day and day of the month", () => {
    expect(predecessorOf(r, [cand({})])?.id).toBe("p1");
    expect(predecessorOf(r, [cand({ endOn: "2026-11-08" })])).toBeNull();
    expect(predecessorOf(r, [cand({ byMonthDay: 5 })])).toBeNull();
  });

  it("prefers the same description, then the greatest id", () => {
    const pick = predecessorOf(r, [
      cand({ id: "p3", description: "Outra" }),
      cand({ id: "p1" }),
      cand({ id: "p2" }),
    ]);
    expect(pick?.id).toBe("p2");
  });
});

describe("summarizeSubscriptions (properties)", () => {
  const ruleArb = fc.record({
    n: fc.integer({ min: 1, max: 9 }),
    cents: fc.integer({ min: 100, max: 500_000 }),
    before: fc.option(fc.integer({ min: 100, max: 500_000 }), { nil: null }),
  });

  it("sums every subscription, never negative increases, and cuts at the limit", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(ruleArb, { selector: (r) => r.n, maxLength: 8 }),
        fc.integer({ min: 0, max: 8 }),
        (specs, limit) => {
          const rules = specs.map((r) =>
            rule({ id: `r${r.n}`, amountCents: -r.cents }),
          );
          const occurrences = specs.flatMap((r) => [
            occ(`r${r.n}`, "2026-11-10", -r.cents),
            ...(r.before === null
              ? []
              : [occ(`r${r.n}`, "2026-09-10", -r.before)]),
          ]);
          const s = summarizeSubscriptions({
            ...base,
            limit,
            rules,
            predecessors: [],
            occurrences,
          });
          expect(s.totalCount).toBe(specs.length);
          expect(s.monthlyCents).toBe(specs.reduce((t, r) => t + r.cents, 0));
          expect(s.items).toHaveLength(Math.min(limit, specs.length));
          expect(s.hiddenIncreasedCount).toBeLessThanOrEqual(s.increasedCount);
          for (const i of s.items) {
            expect(i.increaseCents).toBeGreaterThanOrEqual(0);
            if (i.increaseCents > 0) expect(i.previousCents).not.toBeNull();
          }
        },
      ),
    );
  });
});
