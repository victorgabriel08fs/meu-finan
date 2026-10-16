import { describe, expect, it } from "vitest";
import { iso, parse } from "./dates";
import { occurrencesBetween, type Recurrence } from "./recurrence";

const D = parse;
const between = (rule: Recurrence, from: string, to: string) =>
  occurrencesBetween(rule, D(from), D(to)).map(iso);

describe("occurrencesBetween", () => {
  it("daily, every N days", () => {
    const rule: Recurrence = {
      freq: "daily",
      interval: 3,
      start: D("2026-10-01"),
    };
    expect(between(rule, "2026-10-01", "2026-10-10")).toEqual([
      "2026-10-01",
      "2026-10-04",
      "2026-10-07",
      "2026-10-10",
    ]);
    expect(between(rule, "2026-10-02", "2026-10-06")).toEqual(["2026-10-04"]);
  });

  it("weekly keeps the weekday across months", () => {
    const rule: Recurrence = {
      freq: "weekly",
      interval: 1,
      start: D("2026-10-14"),
    };
    expect(between(rule, "2026-10-20", "2026-11-12")).toEqual([
      "2026-10-21",
      "2026-10-28",
      "2026-11-04",
      "2026-11-11",
    ]);
  });

  it("monthly with interval > 1 (bimonthly from 31/jan) comes back to the 31st", () => {
    const rule: Recurrence = {
      freq: "monthly",
      interval: 2,
      start: D("2026-01-31"),
    };
    expect(between(rule, "2026-01-01", "2026-12-31")).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
      "2026-07-31",
      "2026-09-30",
      "2026-11-30",
    ]);
    // A window that skips the first occurrence starts at the next one.
    expect(between(rule, "2026-02-01", "2026-04-30")).toEqual(["2026-03-31"]);
  });

  it("monthly on the 30th visits February as its last day, leap years included", () => {
    const rule: Recurrence = {
      freq: "monthly",
      interval: 1,
      start: D("2024-01-30"),
    };
    expect(between(rule, "2024-02-01", "2024-03-31")).toEqual([
      "2024-02-29",
      "2024-03-30",
    ]);
    expect(between(rule, "2025-02-01", "2025-02-28")).toEqual(["2025-02-28"]);
  });

  it("byMonthDay overrides the start day, and nothing comes before start", () => {
    const rule: Recurrence = {
      freq: "monthly",
      interval: 1,
      start: D("2026-01-20"),
      byMonthDay: 5,
    };
    // 05/jan precedes the start: the first occurrence is 05/fev.
    expect(between(rule, "2026-01-01", "2026-03-31")).toEqual([
      "2026-02-05",
      "2026-03-05",
    ]);
    const lastDay: Recurrence = { ...rule, byMonthDay: 31 };
    expect(between(lastDay, "2026-01-01", "2026-02-28")).toEqual([
      "2026-01-31",
      "2026-02-28",
    ]);
  });

  it("yearly with interval > 1", () => {
    const rule: Recurrence = {
      freq: "yearly",
      interval: 2,
      start: D("2024-02-29"),
    };
    expect(between(rule, "2024-01-01", "2030-12-31")).toEqual([
      "2024-02-29",
      "2026-02-28",
      "2028-02-29",
      "2030-02-28",
    ]);
  });

  it("stops at the end date (inclusive)", () => {
    const rule: Recurrence = {
      freq: "monthly",
      interval: 1,
      start: D("2026-01-10"),
      end: D("2026-03-10"),
    };
    expect(between(rule, "2026-01-01", "2026-12-31")).toEqual([
      "2026-01-10",
      "2026-02-10",
      "2026-03-10",
    ]);
  });

  it("is empty for windows before the start, after the end or inverted", () => {
    const rule: Recurrence = {
      freq: "daily",
      interval: 1,
      start: D("2026-10-10"),
      end: D("2026-10-20"),
    };
    expect(between(rule, "2026-10-01", "2026-10-09")).toEqual([]);
    expect(between(rule, "2026-10-21", "2026-10-31")).toEqual([]);
    expect(between(rule, "2026-10-15", "2026-10-12")).toEqual([]);
    expect(
      between({ ...rule, end: D("2026-10-01") }, "2026-01-01", "2026-12-31"),
    ).toEqual([]);
  });

  it("only visits the window, however old the rule is", () => {
    const rule: Recurrence = {
      freq: "daily",
      interval: 1,
      start: D("1000-01-01"),
    };
    expect(between(rule, "9999-12-30", "9999-12-31")).toEqual([
      "9999-12-30",
      "9999-12-31",
    ]);
  });

  it("rejects invalid rules", () => {
    const start = D("2026-10-14");
    const window = [D("2026-10-01"), D("2026-10-31")] as const;
    const bad = [
      null,
      { freq: "hourly", interval: 1, start },
      { freq: "daily", interval: 0, start },
      { freq: "daily", interval: 1.5, start },
      { freq: "daily", interval: 1, start: { year: 2026, month: 2, day: 30 } },
      {
        freq: "daily",
        interval: 1,
        start,
        end: { year: 2026, month: 13, day: 1 },
      },
      { freq: "monthly", interval: 1, start, byMonthDay: 32 },
    ];
    for (const rule of bad) {
      expect(
        () => occurrencesBetween(rule as Recurrence, ...window),
        JSON.stringify(rule),
      ).toThrow(RangeError);
    }
    expect(() =>
      occurrencesBetween(
        { freq: "daily", interval: 1, start },
        { year: 2026, month: 2, day: 30 },
        window[1],
      ),
    ).toThrow(RangeError);
  });
});
