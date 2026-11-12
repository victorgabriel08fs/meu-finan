import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  calendarYearsFor,
  easterSunday,
  type Holiday,
  holidayCalendar,
  isBusinessDay,
  isInGrace,
  nationalHolidays,
  nextBusinessDay,
  nonBusinessDue,
  nonBusinessReason,
  previousBusinessDay,
} from "./business-days";
import { addDays, dayOfWeek, iso, parse } from "./dates";

const dates = (year: number) => nationalHolidays(year).map((h) => h.date);
const cal = (...years: number[]) => holidayCalendar(years);

describe("easterSunday", () => {
  it("matches known Easter dates", () => {
    const known: [number, string][] = [
      [2024, "2024-03-31"],
      [2025, "2025-04-20"],
      [2026, "2026-04-05"],
      [2027, "2027-03-28"],
      [2038, "2038-04-25"],
      [2285, "2285-03-22"],
    ];
    for (const [year, expected] of known) {
      expect(iso(easterSunday(year)), String(year)).toBe(expected);
    }
  });

  it("is always a Sunday between 22/mar and 25/abr (1900-2199)", () => {
    for (let year = 1900; year <= 2199; year += 1) {
      const easter = easterSunday(year);
      expect(dayOfWeek(easter), String(year)).toBe(0);
      const key = easter.month * 100 + easter.day;
      expect(key).toBeGreaterThanOrEqual(322);
      expect(key).toBeLessThanOrEqual(425);
    }
  });

  it("refuses years the algorithm does not cover", () => {
    expect(() => easterSunday(1582)).toThrow();
    expect(() => easterSunday(10_000)).toThrow();
  });
});

describe("nationalHolidays: banking calendar", () => {
  it("2026 is exactly the expected list, by date", () => {
    expect(dates(2026)).toEqual([
      "2026-01-01",
      "2026-02-16", // Carnaval (segunda)
      "2026-02-17", // Carnaval (terça)
      "2026-04-03", // Sexta-feira Santa
      "2026-04-21",
      "2026-05-01",
      "2026-06-04", // Corpus Christi
      "2026-09-07",
      "2026-10-12",
      "2026-11-02",
      "2026-11-15",
      "2026-11-20",
      "2026-12-25",
      "2026-12-31",
    ]);
  });

  it("2027 has Carnaval, Sexta-feira Santa and Corpus Christi on the right days", () => {
    const byDate = new Map(nationalHolidays(2027).map((h) => [h.date, h]));
    expect(byDate.get("2027-02-08")?.name).toBe("Carnaval");
    expect(byDate.get("2027-02-09")?.name).toBe("Carnaval");
    expect(byDate.get("2027-03-26")?.name).toBe("Sexta-feira Santa");
    expect(byDate.get("2027-05-27")?.name).toBe("Corpus Christi");
    expect(dates(2027)).toHaveLength(14);
  });

  it("names 31/dez as a day without banking, not a holiday", () => {
    const last = nationalHolidays(2026).at(-1);
    expect(last).toEqual({
      date: "2026-12-31",
      name: "Último dia do ano",
      kind: "no_banking",
    });
  });

  it("Consciência Negra starts in 2024", () => {
    expect(dates(2023)).not.toContain("2023-11-20");
    expect(dates(2024)).toContain("2024-11-20");
  });

  it("Ash Wednesday and 24/dez are business days", () => {
    const calendar = cal(2026, 2027);
    expect(isBusinessDay(parse("2026-02-18"), calendar)).toBe(true);
    expect(isBusinessDay(parse("2027-02-10"), calendar)).toBe(true);
    expect(isBusinessDay(parse("2026-12-24"), calendar)).toBe(true);
  });

  it("keeps one entry per date: the first name wins (Sexta-feira Santa on Tiradentes)", () => {
    // In a year where Good Friday is 21/abr, Tiradentes (fixed) keeps the date.
    for (let year = 1900; year <= 2199; year += 1) {
      const list = dates(year);
      expect(new Set(list).size, String(year)).toBe(list.length);
    }
    const goodFridayOnTiradentes = Array.from(
      { length: 300 },
      (_, i) => 1900 + i,
    ).find((year) => iso(addDays(easterSunday(year), -2)) === `${year}-04-21`);
    if (goodFridayOnTiradentes) {
      const holiday = nationalHolidays(goodFridayOnTiradentes).find(
        (h) => h.date === `${goodFridayOnTiradentes}-04-21`,
      );
      expect(holiday?.name).toBe("Tiradentes");
    }
  });
});

describe("holidayCalendar", () => {
  it("extra only adds dates; the computed name wins", () => {
    const extra: Holiday[] = [
      { date: "2026-07-09", name: "Novo", kind: "holiday" },
      { date: "2026-11-15", name: "Outro nome", kind: "holiday" },
    ];
    const calendar = holidayCalendar([2026], extra);
    expect(calendar.get("2026-07-09")?.name).toBe("Novo");
    expect(calendar.get("2026-11-15")?.name).toBe("Proclamação da República");
  });

  it("rejects an invalid extra date", () => {
    expect(() =>
      holidayCalendar([2026], [{ date: "x", name: "y", kind: "holiday" }]),
    ).toThrow();
  });
});

describe("weekends and reasons", () => {
  const calendar = cal(2026);

  it("names the weekday first, even on a holiday", () => {
    expect(nonBusinessReason(parse("2026-11-14"), calendar)).toBe("saturday");
    // 15/11/2026 is a Sunday and a holiday: reads "domingo".
    expect(nonBusinessReason(parse("2026-11-15"), calendar)).toBe("sunday");
    expect(nonBusinessReason(parse("2026-11-20"), calendar)).toBe("holiday");
    expect(nonBusinessReason(parse("2026-12-31"), calendar)).toBe("no_banking");
    expect(nonBusinessReason(parse("2026-11-12"), calendar)).toBeNull();
  });

  it("finds the next and the previous business day around the weekend", () => {
    expect(iso(nextBusinessDay(parse("2026-11-13"), calendar))).toBe(
      "2026-11-16",
    );
    expect(iso(nextBusinessDay(parse("2026-11-14"), calendar))).toBe(
      "2026-11-16",
    );
    expect(iso(previousBusinessDay(parse("2026-11-15"), calendar))).toBe(
      "2026-11-13",
    );
    // Strictly after / before, even from a business day.
    expect(iso(nextBusinessDay(parse("2026-11-12"), calendar))).toBe(
      "2026-11-13",
    );
  });

  it("skips Carnival through the weekend and the holiday on Friday", () => {
    const c = cal(2026);
    // Sexta antes do Carnaval 13/2 -> quarta de cinzas 18/2.
    expect(iso(nextBusinessDay(parse("2026-02-13"), c))).toBe("2026-02-18");
    expect(iso(previousBusinessDay(parse("2026-02-18"), c))).toBe("2026-02-13");
    // 20/11 (sexta) é feriado: 19/11 -> 23/11.
    expect(iso(nextBusinessDay(parse("2026-11-19"), c))).toBe("2026-11-23");
  });

  it("31/dez steps into January across the year", () => {
    const c = cal(2026, 2027);
    expect(iso(nextBusinessDay(parse("2026-12-30"), c))).toBe("2027-01-04");
    expect(iso(previousBusinessDay(parse("2027-01-04"), c))).toBe("2026-12-30");
  });
});

describe("nonBusinessDue", () => {
  const calendar = cal(2026);

  it("is null on business days", () => {
    expect(nonBusinessDue("2026-11-12", calendar)).toBeNull();
    expect(nonBusinessDue("2026-12-24", calendar)).toBeNull();
  });

  it("describes a Saturday", () => {
    expect(nonBusinessDue("2026-11-14", calendar)).toEqual({
      reason: "saturday",
      holidayName: null,
      nextBusinessDay: "2026-11-16",
      previousBusinessDay: "2026-11-13",
    });
  });

  it("describes a weekday holiday with its name", () => {
    expect(nonBusinessDue("2026-11-20", calendar)).toEqual({
      reason: "holiday",
      holidayName: "Consciência Negra",
      nextBusinessDay: "2026-11-23",
      previousBusinessDay: "2026-11-19",
    });
  });

  it("describes 31/dez", () => {
    expect(nonBusinessDue("2026-12-31", cal(2026, 2027))).toMatchObject({
      reason: "no_banking",
      holidayName: "Último dia do ano",
      nextBusinessDay: "2027-01-04",
      previousBusinessDay: "2026-12-30",
    });
  });
});

describe("calendarYearsFor", () => {
  it("covers the neighbours, so 31/dez and 01/jan resolve", () => {
    expect(calendarYearsFor(["2026-12-31"])).toEqual([2025, 2026, 2027]);
    expect(calendarYearsFor(["2027-01-01", "2026-06-01"])).toEqual([
      2025, 2026, 2027, 2028,
    ]);
    expect(calendarYearsFor([])).toEqual([]);
  });
});

describe("isInGrace (D2)", () => {
  const nb = nonBusinessDue("2026-11-14", cal(2026)); // Saturday

  it("is the span after the due date up to the next business day", () => {
    expect(isInGrace("2026-11-14", nb, "2026-11-14")).toBe(false); // due today
    expect(isInGrace("2026-11-14", nb, "2026-11-15")).toBe(true); // Sunday
    expect(isInGrace("2026-11-14", nb, "2026-11-16")).toBe(true); // Monday: last day
    expect(isInGrace("2026-11-14", nb, "2026-11-17")).toBe(false); // overdue
  });

  it("is never true without a non-business due date", () => {
    expect(isInGrace("2026-11-12", null, "2026-11-13")).toBe(false);
    expect(isInGrace("2026-11-12", undefined, "2026-11-13")).toBe(false);
  });
});

describe("business day properties", () => {
  const calendar = cal(...Array.from({ length: 5 }, (_, i) => 2025 + i));
  const dateArb = fc
    .integer({ min: 0, max: 365 * 4 })
    .map((n) => addDays(parse("2026-01-01"), n - 365));

  it("next is later, a business day, and every day in between is not", () => {
    fc.assert(
      fc.property(dateArb, (date) => {
        const next = nextBusinessDay(date, calendar);
        expect(iso(next) > iso(date)).toBe(true);
        expect(isBusinessDay(next, calendar)).toBe(true);
        for (let d = addDays(date, 1); iso(d) < iso(next); d = addDays(d, 1)) {
          expect(isBusinessDay(d, calendar)).toBe(false);
        }
      }),
    );
  });

  it("previous is earlier, a business day, and every day in between is not", () => {
    fc.assert(
      fc.property(dateArb, (date) => {
        const prev = previousBusinessDay(date, calendar);
        expect(iso(prev) < iso(date)).toBe(true);
        expect(isBusinessDay(prev, calendar)).toBe(true);
        for (let d = addDays(prev, 1); iso(d) < iso(date); d = addDays(d, 1)) {
          expect(isBusinessDay(d, calendar)).toBe(false);
        }
      }),
    );
  });

  it("nonBusinessDue is null exactly on business days, and its dates bracket the due date", () => {
    fc.assert(
      fc.property(dateArb, (date) => {
        const due = nonBusinessDue(iso(date), calendar);
        expect(due === null).toBe(isBusinessDay(date, calendar));
        if (due) {
          expect(due.previousBusinessDay < iso(date)).toBe(true);
          expect(due.nextBusinessDay > iso(date)).toBe(true);
        }
      }),
    );
  });

  it("never has more than 4 non-business days in a row (1900-2199)", () => {
    for (let year = 1900; year <= 2199; year += 1) {
      const c = holidayCalendar([year - 1, year, year + 1]);
      let run = 0;
      for (
        let d = parse(`${year}-01-01`);
        iso(d) <= `${year}-12-31`;
        d = addDays(d, 1)
      ) {
        run = isBusinessDay(d, c) ? 0 : run + 1;
        expect(run, `${year} ${iso(d)}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it("holiday dates are unique and sorted every year", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1900, max: 2199 }), (year) => {
        const list = dates(year);
        expect(new Set(list).size).toBe(list.length);
        expect([...list].sort()).toEqual(list);
        expect(list.every((d) => d.startsWith(String(year)))).toBe(true);
      }),
    );
  });
});
