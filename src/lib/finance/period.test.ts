import { describe, expect, it } from "vitest";
import { iso, parse } from "./dates";
import {
  isInPeriod,
  MAX_PERIOD_START_DAY,
  type Period,
  periodContaining,
  periodDays,
  periodForMonth,
  shiftPeriod,
} from "./period";

const D = parse;
const range = (period: Period) => `${iso(period.start)} – ${iso(period.end)}`;

describe("financial month", () => {
  it("with start day 1 is the calendar month", () => {
    const period = periodContaining(D("2026-10-14"), 1);
    expect(range(period)).toBe("2026-10-01 – 2026-10-31");
    expect(period.label).toEqual({ year: 2026, month: 10 });
    expect(periodDays(period)).toBe(31);
  });

  it("is labelled by the month it starts in (outubro = 5/out – 4/nov)", () => {
    expect(range(periodForMonth({ year: 2026, month: 10 }, 5))).toBe(
      "2026-10-05 – 2026-11-04",
    );
    expect(range(periodContaining(D("2026-10-05"), 5))).toBe(
      "2026-10-05 – 2026-11-04",
    );
    expect(range(periodContaining(D("2026-11-04"), 5))).toBe(
      "2026-10-05 – 2026-11-04",
    );
    expect(range(periodContaining(D("2027-01-03"), 5))).toBe(
      "2026-12-05 – 2027-01-04",
    );
  });

  it("start day 28 works in February, leap years included", () => {
    expect(MAX_PERIOD_START_DAY).toBe(28);
    expect(range(periodContaining(D("2026-02-27"), 28))).toBe(
      "2026-01-28 – 2026-02-27",
    );
    expect(range(periodContaining(D("2026-02-28"), 28))).toBe(
      "2026-02-28 – 2026-03-27",
    );
    const leap = periodContaining(D("2024-02-29"), 28);
    expect(range(leap)).toBe("2024-02-28 – 2024-03-27");
    expect(periodDays(leap)).toBe(29);
    expect(periodDays(periodForMonth({ year: 2026, month: 2 }, 28))).toBe(28);
  });

  it("shifts by whole months both ways", () => {
    const october = periodForMonth({ year: 2026, month: 10 }, 5);
    expect(range(shiftPeriod(october, 1))).toBe("2026-11-05 – 2026-12-04");
    expect(range(shiftPeriod(october, -10))).toBe("2025-12-05 – 2026-01-04");
    expect(shiftPeriod(october, 0)).toEqual(october);
  });

  it("checks membership, both ends included", () => {
    const october = periodForMonth({ year: 2026, month: 10 }, 5);
    expect(isInPeriod(D("2026-10-05"), october)).toBe(true);
    expect(isInPeriod(D("2026-11-04"), october)).toBe(true);
    expect(isInPeriod(D("2026-11-05"), october)).toBe(false);
    expect(isInPeriod(D("2026-10-04"), october)).toBe(false);
  });

  it("rejects start days outside 1–28 and invalid dates", () => {
    for (const day of [0, 29, 31, 1.5]) {
      expect(() => periodContaining(D("2026-10-14"), day)).toThrow(RangeError);
    }
    expect(() => periodForMonth({ year: 2026, month: 13 }, 1)).toThrow(/label/);
    expect(() =>
      periodContaining({ year: 2026, month: 2, day: 29 }, 1),
    ).toThrow(RangeError);
  });
});
