import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { projectGoal } from "./goals";
import { projectSharedBox, type SharedBoxMember } from "./shared-box";

const RUNS = { numRuns: 300 };
const today = { year: 2026, month: 11 };

const member = (
  id: string,
  savedCents: number,
  monthlyCents: number,
  weight = 1,
): SharedBoxMember => ({ id, savedCents, monthlyCents, weight });

describe("projectSharedBox", () => {
  it("projects the total with everyone's plans and each part on its own", () => {
    // Viagem para Salvador: R$ 8.000 until jun/2027; Ana R$ 1.800 (R$ 400/mês),
    // Bruno R$ 1.100 (R$ 300/mês).
    const result = projectSharedBox({
      members: [
        member("ana", 180_000, 40_000),
        member("bruno", 110_000, 30_000),
      ],
      targetCents: 800_000,
      targetMonth: { year: 2027, month: 6 },
      monthlyRate: 0,
      today,
    });
    expect(result.savedCents).toBe(290_000);
    expect(result.monthlyCents).toBe(70_000);
    expect(result.progress).toBeCloseTo(290_000 / 800_000);
    // R$ 5.100 missing at R$ 700/mês: 7,3 months → 8 → jul/2027.
    expect(result.total?.eta).toEqual({ year: 2027, month: 7 });
    expect(result.total?.status).toBe("behind");
    const [ana, bruno] = result.members;
    expect(ana?.shareCents).toBe(400_000);
    expect(ana?.missingCents).toBe(220_000);
    // R$ 2.200 at R$ 400/mês: 5,5 → 6 months → mai/2027.
    expect(ana?.projection?.eta).toEqual({ year: 2027, month: 5 });
    expect(bruno?.shareCents).toBe(400_000);
    expect(bruno?.missingCents).toBe(290_000);
  });

  it("splits the target by percentage weights", () => {
    const result = projectSharedBox({
      members: [member("ana", 0, 0, 6_000), member("bruno", 0, 0, 4_000)],
      targetCents: 100_001,
      monthlyRate: 0,
      today,
    });
    expect(result.members.map((row) => row.shareCents)).toEqual([
      60_001, 40_000,
    ]);
  });

  it("leaves a member who plans nothing without an eta", () => {
    const result = projectSharedBox({
      members: [member("ana", 10_000, 5_000), member("bruno", 0, 0)],
      targetCents: 100_000,
      monthlyRate: 0,
      today,
    });
    expect(result.members[0]?.projection?.eta).not.toBeNull();
    expect(result.members[1]?.projection).toMatchObject({
      status: "no_plan",
      eta: null,
    });
  });

  it("is reached once the total meets the target, even if one part is short", () => {
    const result = projectSharedBox({
      members: [member("ana", 90_000, 0), member("bruno", 10_000, 0)],
      targetCents: 100_000,
      monthlyRate: 0,
      today,
    });
    expect(result.total?.status).toBe("achieved");
    expect(result.progress).toBe(1);
    expect(result.members[0]?.missingCents).toBe(0);
    expect(result.members[1]?.missingCents).toBe(40_000);
  });

  it("has no projection without a target", () => {
    const result = projectSharedBox({
      members: [member("ana", 10_000, 5_000)],
      targetCents: null,
      monthlyRate: 0,
      today,
    });
    expect(result).toEqual({
      savedCents: 10_000,
      monthlyCents: 5_000,
      progress: null,
      total: null,
      members: [
        {
          id: "ana",
          savedCents: 10_000,
          monthlyCents: 5_000,
          shareCents: null,
          missingCents: null,
          projection: null,
        },
      ],
    });
  });

  it("gives no part (and no projection) to a zero weight", () => {
    const result = projectSharedBox({
      members: [member("ana", 0, 0, 10_000), member("bruno", 0, 0, 0)],
      targetCents: 50_000,
      monthlyRate: 0,
      today,
    });
    expect(result.members[1]).toMatchObject({
      shareCents: 0,
      missingCents: 0,
      projection: null,
    });
  });

  it("rejects negative amounts, fractional weights and weights without a sum", () => {
    const base = { targetCents: 1_000, monthlyRate: 0, today };
    expect(() =>
      projectSharedBox({ ...base, members: [member("a", -1, 0)] }),
    ).toThrow(RangeError);
    expect(() =>
      projectSharedBox({ ...base, members: [member("a", 0, 0, 1.5)] }),
    ).toThrow(RangeError);
    expect(() =>
      projectSharedBox({ ...base, members: [member("a", 0, 0, 0)] }),
    ).toThrow(RangeError);
    expect(() =>
      projectSharedBox({ ...base, targetCents: 0, members: [] }),
    ).toThrow(RangeError);
  });

  const members = fc.array(
    fc.record({
      saved: fc.integer({ min: 0, max: 10_000_000 }),
      monthly: fc.integer({ min: 0, max: 1_000_000 }),
      weight: fc.integer({ min: 0, max: 10_000 }),
    }),
    { minLength: 1, maxLength: 6 },
  );
  const target = fc.integer({ min: 1, max: 99_999_999 });

  it("always gives parts that sum to the target", () => {
    fc.assert(
      fc.property(
        members.filter((list) => list.some((row) => row.weight > 0)),
        target,
        (list, targetCents) => {
          const result = projectSharedBox({
            members: list.map((row, index) =>
              member(`m${index}`, row.saved, row.monthly, row.weight),
            ),
            targetCents,
            monthlyRate: 0,
            today,
          });
          const sum = result.members.reduce(
            (total, row) => total + (row.shareCents ?? 0),
            0,
          );
          expect(sum).toBe(targetCents);
          for (const row of result.members) {
            expect(row.missingCents).toBe(
              Math.max(0, (row.shareCents ?? 0) - row.savedCents),
            );
          }
          expect(result.savedCents).toBe(
            list.reduce((total, row) => total + row.saved, 0),
          );
        },
      ),
      RUNS,
    );
  });

  it("matches projectGoal with a single member", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        target,
        fc.integer({ min: 0, max: 30 }),
        fc.option(fc.integer({ min: 1, max: 60 }), { nil: undefined }),
        (saved, monthly, targetCents, ratePerMille, monthsAhead) => {
          const monthlyRate = ratePerMille / 10_000;
          const targetMonth =
            monthsAhead === undefined
              ? undefined
              : {
                  year:
                    today.year +
                    Math.floor((today.month - 1 + monthsAhead) / 12),
                  month: ((today.month - 1 + monthsAhead) % 12) + 1,
                };
          const goal = projectGoal({
            currentCents: saved,
            targetCents,
            monthlyCents: monthly,
            monthlyRate,
            today,
            targetMonth,
          });
          const result = projectSharedBox({
            members: [member("only", saved, monthly)],
            targetCents,
            targetMonth,
            monthlyRate,
            today,
          });
          expect(result.total).toEqual(goal);
          expect(result.members[0]?.projection).toEqual(goal);
          expect(result.members[0]?.shareCents).toBe(targetCents);
        },
      ),
      RUNS,
    );
  });
});
