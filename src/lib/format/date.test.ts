import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dayHeaderLabel,
  durationLabel,
  fullDateLabel,
  monthLabel,
  periodLabel,
  relativeDayLabel,
  shortDateLabel,
  shortMonthLabel,
  todayInTimeZone,
} from "./date";

// 14/out/2025 is a Tuesday ("ter"), as in the doc 02 mockups.
const TODAY = "2025-10-14";

describe("relativeDayLabel", () => {
  it.each([
    ["2025-10-14", "Hoje"],
    ["2025-10-13", "Ontem"],
    ["2025-10-15", "Amanhã"],
    ["2025-10-16", "em 2 dias"],
    ["2025-10-17", "em 3 dias"],
    ["2025-10-20", "em 6 dias"],
    ["2025-10-12", "há 2 dias"],
    ["2025-10-08", "há 6 dias"],
    ["2025-10-21", "21/out"],
    ["2025-10-07", "7/out"],
    ["2025-03-01", "1/mar"],
  ])("%s → %j", (date, expected) => {
    expect(relativeDayLabel(date, TODAY)).toBe(expected);
  });

  it("counts across months and years", () => {
    expect(relativeDayLabel("2026-01-01", "2025-12-31")).toBe("Amanhã");
    expect(relativeDayLabel("2024-02-29", "2024-03-02")).toBe("há 2 dias");
  });

  it("adds a two-digit year beyond a week in another year", () => {
    expect(relativeDayLabel("2026-01-25", TODAY)).toBe("25/jan/26");
    expect(relativeDayLabel("2024-10-14", TODAY)).toBe("14/out/24");
  });

  it("rejects anything but YYYY-MM-DD", () => {
    expect(() => relativeDayLabel("14/10/2025", TODAY)).toThrow(RangeError);
    expect(() => relativeDayLabel(TODAY, "2025-02-29")).toThrow(RangeError);
  });
});

describe("dayHeaderLabel", () => {
  it.each([
    ["2025-10-14", "Hoje · ter, 14 out"],
    ["2025-10-13", "Ontem · seg, 13 out"],
    ["2025-10-15", "Amanhã · qua, 15 out"],
    ["2025-10-11", "sáb, 11 out"],
    ["2025-10-12", "dom, 12 out"],
    ["2025-10-17", "sex, 17 out"],
    ["2025-03-06", "qui, 6 mar"],
  ])("%s → %j", (date, expected) => {
    expect(dayHeaderLabel(date, TODAY)).toBe(expected);
  });

  it("uses a middle dot (U+00B7) after the relative word", () => {
    expect(dayHeaderLabel(TODAY, TODAY)).toBe("Hoje · ter, 14 out");
  });

  it("adds the year when it is not today's year", () => {
    expect(dayHeaderLabel("2024-12-31", TODAY)).toBe("ter, 31 dez 2024");
    expect(dayHeaderLabel("2025-12-31", "2026-01-01")).toBe(
      "Ontem · qua, 31 dez 2025",
    );
    expect(dayHeaderLabel("2024-02-29", TODAY)).toBe("qui, 29 fev 2024");
  });

  it("rejects invalid dates", () => {
    expect(() => dayHeaderLabel("2025-13-01", TODAY)).toThrow(RangeError);
  });
});

describe("month labels", () => {
  it.each([
    ["2026-10", "outubro de 2026", "out/26"],
    ["2026-03", "março de 2026", "mar/26"],
    ["2005-01", "janeiro de 2005", "jan/05"],
    ["2000-12", "dezembro de 2000", "dez/00"],
  ])("%s → %j · %j", (month, long, short) => {
    expect(monthLabel(month)).toBe(long);
    expect(shortMonthLabel(month)).toBe(short);
  });

  it("rejects anything but YYYY-MM", () => {
    expect(() => monthLabel("2026-10-01")).toThrow(RangeError);
    expect(() => shortMonthLabel("10/2026")).toThrow(RangeError);
  });
});

describe("periodLabel", () => {
  it("joins both ends with an en dash (U+2013)", () => {
    expect(periodLabel("2026-10-05", "2026-11-04")).toBe("5/out – 4/nov");
    expect(periodLabel("2026-10-01", "2026-10-31")).toBe("1/out – 31/out");
    expect(periodLabel("2026-12-05", "2027-01-04")).toBe("5/dez – 4/jan");
    expect(periodLabel("2026-10-14", "2026-10-14")).toBe("14/out – 14/out");
  });

  it("rejects an end before the start", () => {
    expect(() => periodLabel("2026-11-04", "2026-10-05")).toThrow(
      /end must not be before start/,
    );
  });
});

describe("short and full dates", () => {
  it("formats data curta and data completa", () => {
    expect(shortDateLabel("2026-10-14")).toBe("14/out");
    expect(shortDateLabel("2026-02-05")).toBe("5/fev");
    expect(shortDateLabel("2025-12-30", true)).toBe("30/dez/25");
    expect(fullDateLabel("2026-10-14")).toBe("14 de outubro de 2026");
    expect(fullDateLabel("2026-03-01")).toBe("1º de março de 2026");
    expect(() => fullDateLabel("2026-02-30")).toThrow(RangeError);
  });
});

describe("durationLabel", () => {
  it.each([
    [0, "0 meses"],
    [1, "1 mês"],
    [11, "11 meses"],
    [12, "1 ano"],
    [13, "1 ano e 1 mês"],
    [24, "2 anos"],
    [25, "2 anos e 1 mês"],
    [87, "7 anos e 3 meses"],
    [600, "50 anos"],
  ])("%d → %j", (months, expected) => {
    expect(durationLabel(months)).toBe(expected);
  });

  it("rejects negative or fractional months", () => {
    expect(() => durationLabel(-1)).toThrow(RangeError);
    expect(() => durationLabel(1.5)).toThrow(RangeError);
  });
});

describe("todayInTimeZone", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the clock in the given time zone (São Paulo by default)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 02:30 UTC on the 15th is still 23:30 of the 14th in São Paulo.
    vi.setSystemTime(new Date("2026-10-15T02:30:00Z"));
    expect(todayInTimeZone()).toBe("2026-10-14");
    expect(todayInTimeZone("America/Sao_Paulo")).toBe("2026-10-14");
    expect(todayInTimeZone("UTC")).toBe("2026-10-15");
    expect(todayInTimeZone("Asia/Tokyo")).toBe("2026-10-15");
    vi.setSystemTime(new Date("2026-10-15T03:00:00Z"));
    expect(todayInTimeZone()).toBe("2026-10-15");
  });

  it("rejects unknown time zones", () => {
    expect(() => todayInTimeZone("Mars/Olympus")).toThrow(RangeError);
  });
});
