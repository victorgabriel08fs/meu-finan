import { describe, expect, it } from "vitest";
import { iso, parse } from "@/lib/finance";
import {
  billKey,
  closedPeriod,
  isMonthlySummaryDay,
  isWeeklySummaryDay,
  pickNextIncome,
  previousWeek,
  selectBillReminders,
} from "./schedule";

// 09/nov/2026 is a Monday.
const MONDAY = parse("2026-11-09");

describe("weekly summary", () => {
  it("goes out on Mondays only", () => {
    expect(isWeeklySummaryDay(MONDAY)).toBe(true);
    expect(isWeeklySummaryDay(parse("2026-11-08"))).toBe(false);
    expect(isWeeklySummaryDay(parse("2026-11-10"))).toBe(false);
  });

  it("covers Monday to Sunday of the week before", () => {
    expect(previousWeek(MONDAY)).toEqual({
      start: "2026-11-02",
      end: "2026-11-08",
    });
    expect(previousWeek(parse("2027-01-04"))).toEqual({
      start: "2026-12-28",
      end: "2027-01-03",
    });
  });
});

describe("monthly summary", () => {
  it("goes out on the first day of the financial month", () => {
    expect(isMonthlySummaryDay(parse("2026-11-01"), 1)).toBe(true);
    expect(isMonthlySummaryDay(parse("2026-11-02"), 1)).toBe(false);
    expect(isMonthlySummaryDay(parse("2026-11-28"), 28)).toBe(true);
    expect(isMonthlySummaryDay(parse("2026-11-01"), 28)).toBe(false);
    expect(isMonthlySummaryDay(MONDAY, 9)).toBe(true);
  });

  it("covers the financial month that closed", () => {
    const october = closedPeriod(parse("2026-11-01"), 1);
    expect(iso(october.start)).toBe("2026-10-01");
    expect(iso(october.end)).toBe("2026-10-31");
    expect(october.label).toEqual({ year: 2026, month: 10 });
    const from28th = closedPeriod(parse("2026-11-28"), 28);
    expect(iso(from28th.start)).toBe("2026-10-28");
    expect(iso(from28th.end)).toBe("2026-11-27");
    const ninth = closedPeriod(MONDAY, 9);
    expect(iso(ninth.start)).toBe("2026-10-09");
    expect(iso(ninth.end)).toBe("2026-11-08");
  });
});

describe("selectBillReminders", () => {
  const bill = (
    id: string,
    dueOn: string,
    type: "transaction" | "invoice" = "transaction",
  ) => ({ id, dueOn, type });
  const items = [
    bill("d0", "2026-11-09"),
    bill("d1", "2026-11-10"),
    bill("d2", "2026-11-11"),
    bill("d3", "2026-11-12", "invoice"),
    bill("d4", "2026-11-13"),
    bill("v1", "2026-11-08"),
    bill("v7", "2026-11-02", "invoice"),
    bill("v8", "2026-11-01"),
  ];
  const select = (leadDays: number, notified: string[] = []) =>
    selectBillReminders(items, {
      todayIso: "2026-11-09",
      leadDays,
      notifiedKeys: new Set(notified),
    });

  it("keys pending entries and invoices apart", () => {
    expect(billKey(bill("a", "2026-11-10"))).toBe("t:a:2026-11-10");
    expect(billKey(bill("a", "2026-11-10", "invoice"))).toBe("f:a:2026-11-10");
  });

  it("takes the lead days, then the ones overdue up to 7 days", () => {
    expect(select(0).map((r) => r.item.id)).toEqual(["d0", "v1", "v7"]);
    expect(select(1).map((r) => r.item.id)).toEqual(["d0", "d1", "v1", "v7"]);
    expect(select(3).map((r) => r.item.id)).toEqual([
      "d0",
      "d1",
      "d2",
      "d3",
      "v1",
      "v7",
    ]);
  });

  it("marks overdue ones apart, with their own key", () => {
    const [today, , overdue] = select(0);
    expect(today).toMatchObject({
      key: "t:d0:2026-11-09",
      overdue: false,
      days: 0,
    });
    expect(overdue).toMatchObject({
      key: "f:v7:2026-11-02:vencida",
      overdue: true,
      days: -7,
    });
  });

  it("skips what was already notified", () => {
    expect(
      select(1, ["t:d0:2026-11-09", "t:v1:2026-11-08:vencida"]).map(
        (r) => r.item.id,
      ),
    ).toEqual(["d1", "v7"]);
    // Notified before the due date, notified once more when overdue.
    expect(select(0, ["t:v1:2026-11-08"]).map((r) => r.item.id)).toContain(
      "v1",
    );
  });

  it("notifies again when the due date moves", () => {
    expect(select(0, ["t:d0:2026-11-05"]).map((r) => r.item.id)).toContain(
      "d0",
    );
  });
});

describe("pickNextIncome", () => {
  const income = (occurredOn: string, amountCents: number) => ({
    occurredOn,
    amountCents,
  });

  it("looks from tomorrow up to 7 days ahead", () => {
    for (const day of ["2026-11-09", "2026-11-05", "2026-11-17"]) {
      expect(pickNextIncome([income(day, 100)], "2026-11-09")).toBeNull();
    }
    for (const day of ["2026-11-10", "2026-11-16"]) {
      expect(pickNextIncome([income(day, 100)], "2026-11-09")).toEqual(
        income(day, 100),
      );
    }
  });

  it("takes the soonest, and the largest on the same day", () => {
    expect(
      pickNextIncome(
        [
          income("2026-11-14", 795_000),
          income("2026-11-12", 10_000),
          income("2026-11-12", 65_000),
        ],
        "2026-11-09",
      ),
    ).toEqual(income("2026-11-12", 65_000));
  });

  it("ignores anything but income and takes a longer horizon", () => {
    expect(
      pickNextIncome([income("2026-11-10", -100)], "2026-11-09"),
    ).toBeNull();
    expect(
      pickNextIncome([income("2026-12-20", 100)], "2026-11-09", 60),
    ).toEqual(income("2026-12-20", 100));
  });
});
