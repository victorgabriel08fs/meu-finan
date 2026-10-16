import { describe, expect, it } from "vitest";
import {
  type BudgetPaceInput,
  budgetPace,
  PROJECTION_MIN_DAYS,
  rolloverCents,
} from "./budget";
import { parse } from "./dates";

const D = parse;
const october = { start: D("2026-10-01"), end: D("2026-10-31") };
const pace = (patch: Partial<BudgetPaceInput>) =>
  budgetPace({
    budgetCents: 310_000,
    spentCents: 0,
    scheduledCents: 0,
    period: october,
    today: D("2026-10-14"),
    ...patch,
  });

describe("budgetPace", () => {
  it("counts today as elapsed and as a day left to spend", () => {
    const first = pace({ today: D("2026-10-01") });
    expect(first).toMatchObject({
      totalDays: 31,
      elapsedDays: 1,
      remainingDays: 31,
      perDayCents: 10_000,
    });
    expect(first.elapsedRatio).toBeCloseTo(1 / 31, 15);
    const last = pace({ today: D("2026-10-31") });
    expect(last).toMatchObject({
      elapsedDays: 31,
      remainingDays: 1,
      elapsedRatio: 1,
      perDayCents: 310_000,
    });
  });

  it("before the period: nothing elapsed, every day still ahead", () => {
    const before = pace({ today: D("2026-09-20") });
    expect(before).toMatchObject({
      elapsedDays: 0,
      remainingDays: 31,
      elapsedRatio: 0,
      expectedCents: 0,
      perDayCents: 10_000,
      projectedCents: null,
    });
  });

  it("after the period: everything elapsed, nothing left per day", () => {
    const after = pace({ today: D("2026-11-03"), spentCents: 100_000 });
    expect(after).toMatchObject({
      elapsedDays: 31,
      remainingDays: 0,
      elapsedRatio: 1,
      perDayCents: 0,
      availableCents: 210_000,
      projectedCents: 100_000,
    });
  });

  it("never offers a negative amount per day, and rounds it down", () => {
    expect(pace({ spentCents: 400_000 }).perDayCents).toBe(0);
    expect(pace({ spentCents: 400_000 }).availableCents).toBe(-90_000);
    // 100,00 over 18 days = 5,555… → 5,55.
    expect(pace({ spentCents: 210_000 }).perDayCents).toBe(5555);
  });

  it("projects the end of the period from the 5th day on", () => {
    expect(PROJECTION_MIN_DAYS).toBe(5);
    expect(
      pace({ today: D("2026-10-04"), spentCents: 40_000 }).projectedCents,
    ).toBeNull();
    // 50,00 in 5 days → 310,00 in 31 days, plus the scheduled 20,00.
    expect(
      pace({ today: D("2026-10-05"), spentCents: 5000, scheduledCents: 2000 })
        .projectedCents,
    ).toBe(33_000);
  });

  describe("status", () => {
    it("over beats everything else", () => {
      expect(pace({ spentCents: 310_001, scheduledCents: 5000 }).status).toBe(
        "over",
      );
      expect(pace({ budgetCents: 0, spentCents: 1 }).status).toBe("over");
    });

    it("scheduled when nothing was spent yet but bills are pending", () => {
      expect(pace({ scheduledCents: 1 }).status).toBe("scheduled");
      expect(pace({ spentCents: 1, scheduledCents: 1 }).status).not.toBe(
        "scheduled",
      );
    });

    it("ahead needs more than 110% of the expected spend and at least 25% of the budget", () => {
      // Day 14 of 31: expected 140,00 out of 310,00.
      expect(pace({ spentCents: 154_001 }).status).toBe("ahead");
      expect(pace({ spentCents: 154_000 }).status).toBe("on_track");
      // Day 2: 10× the expected spend but under 25% of the budget.
      expect(pace({ today: D("2026-10-02"), spentCents: 77_000 }).status).toBe(
        "on_track",
      );
      expect(pace({ today: D("2026-10-02"), spentCents: 77_500 }).status).toBe(
        "ahead",
      );
    });

    it("on track otherwise, refunds included", () => {
      expect(pace({}).status).toBe("on_track");
      expect(pace({ spentCents: -5000 }).status).toBe("on_track");
      expect(pace({ budgetCents: 0 }).status).toBe("on_track");
    });
  });

  it("rejects invalid input", () => {
    const bad: Partial<BudgetPaceInput>[] = [
      { budgetCents: -1 },
      { budgetCents: 1.5 },
      { spentCents: Number.NaN },
      { scheduledCents: 0.1 },
      { period: { start: D("2026-10-31"), end: D("2026-10-01") } },
      { today: { year: 2026, month: 2, day: 30 } },
    ];
    for (const patch of bad) {
      expect(() => pace(patch), JSON.stringify(patch)).toThrow(RangeError);
    }
  });
});

describe("rolloverCents", () => {
  it("carries what was left, or what was overspent, to the next period", () => {
    expect(rolloverCents(90_000, 64_000)).toBe(26_000);
    expect(rolloverCents(40_000, 41_000)).toBe(-1000);
    expect(() => rolloverCents(1.5, 0)).toThrow(RangeError);
    expect(() => rolloverCents(0, Number.NaN)).toThrow(RangeError);
  });
});
