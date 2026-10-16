import { describe, expect, it } from "vitest";
import { type GoalInput, projectGoal } from "./goals";

const today = { year: 2026, month: 10 };
const goal = (patch: Partial<GoalInput> = {}): GoalInput => ({
  currentCents: 100_000,
  targetCents: 220_000,
  monthlyCents: 10_000,
  monthlyRate: 0,
  today,
  ...patch,
});

describe("projectGoal", () => {
  it("is achieved once the current amount reaches the target", () => {
    expect(projectGoal(goal({ currentCents: 220_000 }))).toEqual({
      status: "achieved",
      eta: null,
      requiredMonthlyCents: 0,
      slackMonths: null,
    });
    expect(projectGoal(goal({ currentCents: 300_000 })).status).toBe(
      "achieved",
    );
  });

  it("projects from the next month: exact whole months are not rounded up", () => {
    // R$ 1.200 missing at R$ 100/mês with no yield: 12 months → out/2027.
    const projection = projectGoal(goal());
    expect(projection).toEqual({
      status: "on_track",
      eta: { year: 2027, month: 10 },
      requiredMonthlyCents: null,
      slackMonths: null,
    });
    // A fraction of a month still needs that whole month.
    expect(projectGoal(goal({ targetCents: 220_001 })).eta).toEqual({
      year: 2027,
      month: 11,
    });
  });

  it("needs at least one month even for a tiny gap", () => {
    // 1 cent missing at R$ 10 bi/mês: 1e-12 months, below the float tolerance.
    expect(
      projectGoal(
        goal({ currentCents: 219_999, monthlyCents: 1_000_000_000_000 }),
      ).eta,
    ).toEqual({ year: 2026, month: 11 });
  });

  it("has no plan without contributions and without yield", () => {
    const projection = projectGoal(goal({ monthlyCents: 0 }));
    expect(projection.status).toBe("no_plan");
    expect(projection.eta).toBeNull();
  });

  it("still gets there on yield alone", () => {
    const projection = projectGoal(
      goal({ monthlyCents: 0, monthlyRate: 0.01 }),
    );
    // ln(2.2) / ln(1.01) = 79.2 → 80 months.
    expect(projection.eta).toEqual({ year: 2033, month: 6 });
  });

  describe("with a deadline", () => {
    it("is on track with 0 or 1 month of slack, ahead with 2 or more", () => {
      const status = (year: number, month: number) =>
        projectGoal(goal({ targetMonth: { year, month } }));
      expect(status(2027, 10)).toMatchObject({
        status: "on_track",
        slackMonths: 0,
      });
      expect(status(2027, 11)).toMatchObject({
        status: "on_track",
        slackMonths: 1,
      });
      expect(status(2027, 12)).toMatchObject({
        status: "ahead",
        slackMonths: 2,
      });
      expect(status(2027, 9)).toMatchObject({
        status: "behind",
        slackMonths: -1,
      });
    });

    it("rounds the required contribution up to whole reais", () => {
      // R$ 1.200 in 9 months = R$ 133,33… → R$ 134.
      const projection = projectGoal(
        goal({ targetMonth: { year: 2027, month: 7 } }),
      );
      expect(projection.requiredMonthlyCents).toBe(13_400);
      expect(projection.status).toBe("behind");
      // Exactly R$ 100 stays R$ 100.
      expect(
        projectGoal(goal({ targetMonth: { year: 2027, month: 10 } }))
          .requiredMonthlyCents,
      ).toBe(10_000);
    });

    it("is behind without a plan, and asks for the contribution that meets it", () => {
      const projection = projectGoal(
        goal({ monthlyCents: 0, targetMonth: { year: 2027, month: 10 } }),
      );
      expect(projection).toEqual({
        status: "behind",
        eta: null,
        requiredMonthlyCents: 10_000,
        slackMonths: null,
      });
    });

    it("has no required contribution when the deadline is not after this month", () => {
      for (const targetMonth of [today, { year: 2026, month: 3 }]) {
        const projection = projectGoal(goal({ targetMonth }));
        expect(projection.requiredMonthlyCents).toBeNull();
        expect(projection.status).toBe("behind");
      }
    });
  });

  it("rejects invalid input", () => {
    const bad: Partial<GoalInput>[] = [
      { currentCents: 1.5 },
      { targetCents: 0 },
      { targetCents: -100 },
      { monthlyCents: -1 },
      { monthlyCents: Number.NaN },
      { monthlyRate: -1 },
      { today: { year: 2026, month: 13 } },
      { targetMonth: { year: 2026, month: 0 } },
    ];
    for (const patch of bad) {
      expect(() => projectGoal(goal(patch)), JSON.stringify(patch)).toThrow(
        RangeError,
      );
    }
  });
});
