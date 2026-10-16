import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addMonthsToDate,
  assertDate,
  assertYearMonth,
  atDay,
  compare,
  compareMonths,
  DEFAULT_TIME_ZONE,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  isLeapYear,
  iso,
  isoMonth,
  isValidDate,
  isValidYearMonth,
  isWithin,
  type LocalDate,
  localDateIn,
  maxDate,
  minDate,
  monthEnd,
  monthStart,
  monthsBetween,
  parse,
  parseMonth,
  toYearMonth,
} from "./dates";

const D = parse;

describe("validation", () => {
  it("accepts real calendar dates only", () => {
    expect(isValidDate({ year: 2024, month: 2, day: 29 })).toBe(true);
    expect(isValidDate({ year: 2026, month: 2, day: 29 })).toBe(false);
    expect(isValidDate({ year: 2026, month: 4, day: 31 })).toBe(false);
    expect(isValidDate({ year: 2026, month: 1, day: 0 })).toBe(false);
    expect(isValidDate({ year: 2026, month: 1, day: 1.5 })).toBe(false);
    expect(isValidDate({ year: 2026, month: 13, day: 1 })).toBe(false);
    expect(isValidDate({ year: 999, month: 1, day: 1 })).toBe(false);
    expect(isValidDate({ year: 10_000, month: 1, day: 1 })).toBe(false);
    expect(isValidDate(null)).toBe(false);
    expect(isValidDate("2026-01-01")).toBe(false);
  });

  it("accepts year-months, and dates as year-months", () => {
    expect(isValidYearMonth({ year: 2026, month: 12 })).toBe(true);
    expect(isValidYearMonth({ year: 2026, month: 10, day: 14 })).toBe(true);
    expect(isValidYearMonth({ year: 2026, month: 0 })).toBe(false);
    expect(isValidYearMonth({ year: "2026", month: 1 })).toBe(false);
    expect(isValidYearMonth(undefined)).toBe(false);
  });

  it("throws RangeError with the label and the received value", () => {
    expect(() => assertDate({ year: 2026, month: 2, day: 30 }, "due")).toThrow(
      /due must be a valid calendar date \(received \{"year":2026,"month":2,"day":30\}\)/,
    );
    expect(() => assertYearMonth({ year: 2026, month: 13 })).toThrow(
      RangeError,
    );
    expect(() => assertDate(D("2026-10-14"))).not.toThrow();
  });
});

describe("calendar", () => {
  it("knows leap years (divisible by 4, except centuries not divisible by 400)", () => {
    expect([2024, 2000, 2400].map(isLeapYear)).toEqual([true, true, true]);
    expect([2026, 1900, 2100].map(isLeapYear)).toEqual([false, false, false]);
    expect(() => isLeapYear(2026.5)).toThrow(RangeError);
  });

  it("counts the days of each month, February included", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
    expect(() => daysInMonth(2026, 0)).toThrow(RangeError);
  });

  it("clamps a day to the length of the month (31 → 30/29/28)", () => {
    expect(atDay(2026, 2, 31)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(atDay(2024, 2, 31)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(atDay(2026, 4, 31)).toEqual({ year: 2026, month: 4, day: 30 });
    expect(atDay(2026, 3, 31)).toEqual({ year: 2026, month: 3, day: 31 });
    expect(() => atDay(2026, 1, 0)).toThrow(RangeError);
    expect(() => atDay(2026, 1, 32)).toThrow(RangeError);
    expect(() => atDay(2026, 13, 1)).toThrow(RangeError);
  });

  it("gives the weekday (0 = Sunday)", () => {
    expect(dayOfWeek(D("2026-10-14"))).toBe(3);
    expect(dayOfWeek(D("2026-10-18"))).toBe(0);
    expect(dayOfWeek(D("2024-02-29"))).toBe(4);
  });

  it("gives the first and last day of a month", () => {
    expect(iso(monthStart({ year: 2024, month: 2 }))).toBe("2024-02-01");
    expect(iso(monthEnd({ year: 2024, month: 2 }))).toBe("2024-02-29");
    expect(iso(monthEnd({ year: 2026, month: 2 }))).toBe("2026-02-28");
    expect(toYearMonth(D("2026-10-14"))).toEqual({ year: 2026, month: 10 });
  });
});

describe("month arithmetic", () => {
  it("adds and subtracts months across years, dropping the day", () => {
    expect(addMonths({ year: 2026, month: 11 }, 3)).toEqual({
      year: 2027,
      month: 2,
    });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
    });
    expect(addMonths(D("2026-10-31"), 0)).toEqual({ year: 2026, month: 10 });
    expect(addMonths({ year: 2026, month: 10 }, -120)).toEqual({
      year: 2016,
      month: 10,
    });
  });

  it("rejects fractional counts and results beyond the supported years", () => {
    expect(() => addMonths({ year: 2026, month: 1 }, 0.5)).toThrow(RangeError);
    expect(() => addMonths({ year: 9999, month: 12 }, 1)).toThrow(
      /resulting month/,
    );
    expect(() => addMonths({ year: 1000, month: 1 }, -1)).toThrow(RangeError);
  });

  it("keeps the original day when adding months to a date (31/jan → 28/fev → 31/mar)", () => {
    const start = D("2026-01-31");
    expect([0, 1, 2, 3].map((k) => iso(addMonthsToDate(start, k)))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(iso(addMonthsToDate(D("2024-02-29"), 12))).toBe("2025-02-28");
    expect(iso(addMonthsToDate(D("2024-02-29"), 48))).toBe("2028-02-29");
  });

  it("counts and compares months", () => {
    expect(
      monthsBetween({ year: 2026, month: 10 }, { year: 2027, month: 12 }),
    ).toBe(14);
    expect(
      monthsBetween({ year: 2026, month: 10 }, { year: 2026, month: 1 }),
    ).toBe(-9);
    expect(
      compareMonths({ year: 2026, month: 1 }, { year: 2025, month: 12 }),
    ).toBe(1);
    expect(
      compareMonths({ year: 2025, month: 12 }, { year: 2026, month: 1 }),
    ).toBe(-1);
    expect(
      compareMonths({ year: 2026, month: 1 }, { year: 2026, month: 1 }),
    ).toBe(0);
  });
});

describe("day arithmetic", () => {
  it("adds days across months, years and leap days", () => {
    expect(iso(addDays(D("2024-02-28"), 1))).toBe("2024-02-29");
    expect(iso(addDays(D("2026-02-28"), 1))).toBe("2026-03-01");
    expect(iso(addDays(D("2026-12-31"), 1))).toBe("2027-01-01");
    expect(iso(addDays(D("2026-03-01"), -1))).toBe("2026-02-28");
    expect(iso(addDays(D("2026-10-14"), 0))).toBe("2026-10-14");
  });

  it("rejects fractional counts and results beyond the supported years", () => {
    expect(() => addDays(D("2026-10-14"), 1.5)).toThrow(RangeError);
    expect(() => addDays(D("9999-12-31"), 1)).toThrow(/resulting date/);
  });

  it("counts whole days between dates (negative backwards)", () => {
    expect(daysBetween(D("2026-10-01"), D("2026-10-31"))).toBe(30);
    expect(daysBetween(D("2024-01-01"), D("2025-01-01"))).toBe(366);
    expect(daysBetween(D("2026-01-01"), D("2027-01-01"))).toBe(365);
    expect(daysBetween(D("2026-10-14"), D("2026-10-04"))).toBe(-10);
  });

  it("compares, orders and checks windows", () => {
    const a = D("2026-10-04");
    const b = D("2026-10-14");
    expect([compare(a, b), compare(b, a), compare(a, D("2026-10-04"))]).toEqual(
      [-1, 1, 0],
    );
    expect(compare(D("2025-12-31"), D("2026-01-01"))).toBe(-1);
    expect(minDate(a, b)).toBe(a);
    expect(minDate(b, a)).toBe(a);
    expect(maxDate(a, b)).toBe(b);
    expect(maxDate(b, a)).toBe(b);
    expect(isWithin(a, a, b)).toBe(true);
    expect(isWithin(b, a, b)).toBe(true);
    expect(isWithin(D("2026-10-15"), a, b)).toBe(false);
    expect(isWithin(D("2026-10-03"), a, b)).toBe(false);
    expect(() => compare(a, { year: 2026, month: 2, day: 30 })).toThrow(
      RangeError,
    );
  });
});

describe("ISO strings", () => {
  it("formats and parses YYYY-MM-DD", () => {
    expect(iso({ year: 2026, month: 3, day: 5 })).toBe("2026-03-05");
    expect(parse("2026-03-05")).toEqual({ year: 2026, month: 3, day: 5 });
    expect(parse("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("rejects anything that is not a real YYYY-MM-DD date", () => {
    for (const bad of [
      "2026-02-30",
      "2026-2-5",
      "2026-13-01",
      "26-10-14",
      " 2026-10-14",
      "2026-10-14T00:00",
      "",
    ]) {
      expect(() => parse(bad), bad).toThrow(RangeError);
    }
    expect(() => parse(20261014 as unknown as string)).toThrow(
      /Expected a YYYY-MM-DD date/,
    );
    expect(() => iso({ year: 2026, month: 2, day: 29 })).toThrow(RangeError);
  });

  it("formats and parses YYYY-MM", () => {
    expect(isoMonth({ year: 2026, month: 9 })).toBe("2026-09");
    expect(parseMonth("2026-09")).toEqual({ year: 2026, month: 9 });
    for (const bad of ["2026-00", "2026-9", "2026-09-01", "2026"]) {
      expect(() => parseMonth(bad), bad).toThrow(RangeError);
    }
    expect(() => parseMonth(null as unknown as string)).toThrow(RangeError);
  });
});

describe("localDateIn", () => {
  // 2026-10-15T02:30Z is still the 14th in São Paulo (UTC−3).
  const instant = Date.UTC(2026, 9, 15, 2, 30);

  it("gives the calendar date of an instant in a time zone", () => {
    const expected: LocalDate = { year: 2026, month: 10, day: 14 };
    expect(localDateIn(instant, DEFAULT_TIME_ZONE)).toEqual(expected);
    expect(localDateIn(new Date(instant), "America/Sao_Paulo")).toEqual(
      expected,
    );
    expect(localDateIn(instant, "UTC")).toEqual({
      year: 2026,
      month: 10,
      day: 15,
    });
    expect(localDateIn(instant, "-03:00")).toEqual(expected);
  });

  it("rejects unknown time zones and invalid instants", () => {
    expect(() => localDateIn(instant, "Mars/Olympus")).toThrow(RangeError);
    expect(() => localDateIn(Number.NaN, "UTC")).toThrow(RangeError);
  });
});
