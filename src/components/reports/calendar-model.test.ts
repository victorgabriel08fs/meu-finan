import { describe, expect, it } from "vitest";
import { NBSP } from "@/lib/format/money";
import type { DaySpending } from "@/server/domain/reports";
import {
  calendarStats,
  daysWithoutLabel,
  heatmapDays,
  parseDayParam,
  spendingDescription,
} from "./calendar-model";

const plain = (text: string) => text.replaceAll(NBSP, " ");

const day = (
  date: string,
  paidCents = 0,
  paidCount = 0,
  pendingCents = 0,
  pendingCount = 0,
): DaySpending => ({ date, paidCents, paidCount, pendingCents, pendingCount });

const TODAY = "2026-10-14";

describe("spendingDescription", () => {
  it("speaks the day, its total and how many expenses", () => {
    expect(
      plain(spendingDescription(day("2026-10-12", 23_040, 3), TODAY)),
    ).toBe("12 de outubro: R$ 230,40 em 3 despesas");
    expect(plain(spendingDescription(day(TODAY, 5_000, 1), TODAY))).toBe(
      "14 de outubro, hoje: R$ 50 em 1 despesa",
    );
    expect(spendingDescription(day("2026-10-01"), TODAY)).toBe(
      "1º de outubro: sem despesas",
    );
    expect(
      plain(spendingDescription(day("2026-10-10", 0, 0, 15_000, 1), TODAY)),
    ).toBe("10 de outubro: sem despesas; 1 despesa agendada, R$ 150");
  });

  it("speaks of what is scheduled on the days to come", () => {
    expect(
      plain(spendingDescription(day("2026-10-20", 0, 0, 23_980, 2), TODAY)),
    ).toBe("20 de outubro: 2 despesas agendadas, R$ 239,80");
    expect(spendingDescription(day("2026-10-21"), TODAY)).toBe(
      "21 de outubro: dia a vir, nada agendado",
    );
  });
});

describe("heatmapDays", () => {
  it("levels the days up to today and hatches the rest", () => {
    const days = [
      day("2026-10-12", 1_000, 1),
      day("2026-10-13"),
      day("2026-10-14", 9_000, 2),
      day("2026-10-15", 99_000, 1, 210_000, 1),
      day("2026-10-16"),
    ];
    const cells = heatmapDays(days, TODAY);
    expect(cells.map((cell) => cell.level)).toEqual([3, 0, 5, 0, 0]);
    expect(cells.map((cell) => cell.label)).toEqual([
      "12",
      "13",
      "14",
      "15",
      "16",
    ]);
    expect(cells[2]).toMatchObject({ today: true, future: false });
    expect(cells[3]).toMatchObject({ future: true, marked: true });
    expect(cells[4]).toMatchObject({ future: true, marked: false });
  });

  it("names the first day of the next month inside the period", () => {
    const cells = heatmapDays(
      [day("2026-10-31"), day("2026-11-01"), day("2026-11-02")],
      TODAY,
    );
    expect(cells.map((cell) => cell.label)).toEqual(["31", "1 nov", "2"]);
  });
});

describe("calendarStats", () => {
  it("adds up the month, averages the days so far and finds the top day", () => {
    const stats = calendarStats(
      [
        day("2026-10-12", 1_000, 1),
        day("2026-10-13"),
        day("2026-10-14", 9_000, 2),
        day("2026-10-15", 0, 0, 210_000, 1),
      ],
      TODAY,
    );
    expect(stats).toEqual({
      totalCents: 10_000,
      elapsedDays: 3,
      averageCents: 3_333,
      daysWithout: 1,
      top: { date: "2026-10-14", cents: 9_000 },
    });
  });

  it("has no average before the month starts and no top day without spending", () => {
    const stats = calendarStats([day("2026-11-01")], TODAY);
    expect(stats.averageCents).toBeNull();
    expect(stats.top).toBeNull();
    expect(stats.elapsedDays).toBe(0);
  });

  it("keeps the earliest day on ties", () => {
    expect(
      calendarStats(
        [day("2026-10-02", 500, 1), day("2026-10-03", 500, 1)],
        TODAY,
      ).top,
    ).toEqual({ date: "2026-10-02", cents: 500 });
  });

  it("counts days without spending", () => {
    expect(daysWithoutLabel(1)).toBe("1 dia sem gastos");
    expect(daysWithoutLabel(12)).toBe("12 dias sem gastos");
  });
});

describe("parseDayParam", () => {
  const range = { start: "2026-10-05", end: "2026-11-04" };

  it("accepts a real date inside the month on screen", () => {
    expect(parseDayParam("2026-10-14", range)).toBe("2026-10-14");
    expect(parseDayParam(["2026-11-04", "x"], range)).toBe("2026-11-04");
  });

  it("ignores anything else", () => {
    expect(parseDayParam("2026-10-04", range)).toBeNull();
    expect(parseDayParam("2026-11-05", range)).toBeNull();
    expect(parseDayParam("2026-10-32", range)).toBeNull();
    expect(
      parseDayParam("2026-02-30", { start: "2026-02-01", end: "2026-02-28" }),
    ).toBeNull();
    expect(parseDayParam("14/10/2026", range)).toBeNull();
    expect(parseDayParam(undefined, range)).toBeNull();
    expect(parseDayParam(null, range)).toBeNull();
  });
});
