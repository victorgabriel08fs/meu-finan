import { describe, expect, it } from "vitest";
import { holidayCalendar, iso, nonBusinessDue, parse } from "@/lib/finance";
import {
  billKey,
  closedPeriod,
  isMonthlySummaryDay,
  isWeeklySummaryDay,
  pickNextIncome,
  previousWeek,
  selectBillReminders,
  selectNonBusinessDueReminders,
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

describe("selectNonBusinessDueReminders", () => {
  const calendar = holidayCalendar([2026, 2027]);
  const bill = (
    id: string,
    dueOn: string,
    type: "transaction" | "invoice" = "transaction",
  ) => ({ id, dueOn, type, nonBusinessDue: nonBusinessDue(dueOn, calendar) });
  const run = (
    items: ReturnType<typeof bill>[],
    todayIso: string,
    options: {
      notified?: string[];
      covered?: string[];
      preview?: boolean;
    } = {},
  ) =>
    selectNonBusinessDueReminders(items, {
      todayIso,
      notifiedKeys: new Set(options.notified),
      coveredToday: new Set(options.covered),
      preview: options.preview,
    }).map((r) => r.item.id);

  const saturday = bill("sab", "2026-11-14");
  const holiday = bill("feriado", "2026-11-20"); // Friday
  const monday = bill("seg", "2026-11-16"); // business day

  it("sends on the last business day before a weekend", () => {
    expect(run([saturday], "2026-11-13")).toEqual(["sab"]);
    expect(run([saturday], "2026-11-12")).toEqual([]);
  });

  it("sends on the Thursday before a Friday holiday", () => {
    expect(run([holiday], "2026-11-19")).toEqual(["feriado"]);
    expect(run([holiday], "2026-11-18")).toEqual([]);
  });

  it("sends the Friday before a Monday holiday (07/09/2026)", () => {
    expect(run([bill("indep", "2026-09-07")], "2026-09-04")).toEqual(["indep"]);
    expect(run([bill("indep", "2026-09-07")], "2026-09-03")).toEqual([]);
  });

  it("sends on the due day itself when the bill was created late", () => {
    expect(run([saturday], "2026-11-14")).toEqual(["sab"]);
    expect(run([bill("dom", "2026-11-15")], "2026-11-14")).toEqual(["dom"]);
  });

  it("never sends after the due date or for a business day", () => {
    expect(run([saturday], "2026-11-15")).toEqual([]);
    expect(run([monday], "2026-11-13")).toEqual([]);
  });

  it("skips what was notified (keyed by bill and due date) and what Contas a vencer named today", () => {
    expect(
      run([saturday], "2026-11-13", { notified: ["t:sab:2026-11-14"] }),
    ).toEqual([]);
    expect(
      run([saturday], "2026-11-13", { covered: ["t:sab:2026-11-14"] }),
    ).toEqual([]);
    // A moved due date is a new bill key.
    expect(
      run([saturday], "2026-11-13", { notified: ["t:sab:2026-11-07"] }),
    ).toEqual(["sab"]);
    // Invoices have their own key.
    const invoice = bill("fat", "2026-11-14", "invoice");
    expect(
      run([invoice], "2026-11-13", { notified: ["t:fat:2026-11-14"] }),
    ).toEqual(["fat"]);
    expect(
      run([invoice], "2026-11-13", { notified: ["f:fat:2026-11-14"] }),
    ).toEqual([]);
  });

  it("orders by due date, soonest first", () => {
    expect(run([holiday, saturday], "2026-11-19")).toEqual(["feriado"]);
    const sunday = bill("dom", "2026-11-15");
    expect(run([sunday, saturday], "2026-11-13")).toEqual(["sab", "dom"]);
  });

  it("preview lists every annotated bill from today to 7 days ahead, ignoring the filters", () => {
    const far = bill("longe", "2026-11-28"); // Saturday, 16 days away
    const items = [holiday, saturday, monday, far];
    expect(
      run(items, "2026-11-12", {
        preview: true,
        notified: ["t:sab:2026-11-14"],
        covered: ["t:feriado:2026-11-20"],
      }),
    ).toEqual(["sab"]);
    expect(
      run([bill("hoje", "2026-11-14")], "2026-11-14", { preview: true }),
    ).toEqual(["hoje"]);
    expect(
      run([bill("ontem", "2026-11-14")], "2026-11-15", { preview: true }),
    ).toEqual([]);
  });
});

describe("selectBillReminders: grace of a non-business due date (D2)", () => {
  const calendar = holidayCalendar([2026]);
  const sat = {
    id: "sab",
    type: "transaction" as const,
    dueOn: "2026-11-14",
    nonBusinessDue: nonBusinessDue("2026-11-14", calendar),
  };
  const plain = {
    id: "sex",
    type: "transaction" as const,
    dueOn: "2026-11-13",
  };
  const pick = (todayIso: string, items: (typeof sat | typeof plain)[]) =>
    selectBillReminders(items, {
      todayIso,
      leadDays: 0,
      notifiedKeys: new Set(),
    }).map((r) => `${r.item.id}${r.overdue ? ":vencida" : ""}`);

  it("waits for the overdue notice until the day after the next business day", () => {
    expect(pick("2026-11-15", [sat])).toEqual([]); // Sunday
    expect(pick("2026-11-16", [sat])).toEqual([]); // Monday: last day of grace
    expect(pick("2026-11-17", [sat])).toEqual(["sab:vencida"]);
  });

  it("still sends the overdue notice at once for a due date on a business day", () => {
    expect(pick("2026-11-14", [plain])).toEqual(["sex:vencida"]);
  });

  it("is untouched without the annotation (flag off)", () => {
    expect(pick("2026-11-15", [{ ...sat, nonBusinessDue: undefined }])).toEqual(
      ["sab:vencida"],
    );
  });
});
