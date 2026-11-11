import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dailyCashFlow } from "./cash-flow";
import { addDays, daysBetween, iso, type LocalDate, parse } from "./dates";
import { forecastBalance, spendablePerDay } from "./forecast";
import {
  SPENDABLE_BY_DAY_MAX_DAYS,
  type SpendableByDayInput,
  spendablePerDayByDay,
} from "./spendable-by-day";

const D = parse;
const TODAY = D("2026-11-10");
const UNTIL = D("2026-11-30");

/** One forecast day per date from `today`, from a list of balances. */
function series(
  balances: readonly number[],
  today: LocalDate = TODAY,
): SpendableByDayInput["days"] {
  return balances.map((projectedCents, k) => ({
    date: addDays(today, k),
    projectedCents,
  }));
}

describe("spendablePerDayByDay", () => {
  it("spreads the lowest balance ahead over the days left (a bill on the 13th lowers 10 to 13)", () => {
    // 21 days (10 to 30/nov): 210.000 until the 12th, 105.000 from the 13th on.
    const balances = Array.from({ length: 21 }, (_, k) =>
      k < 3 ? 210_000 : 105_000,
    );
    const { rows, shortfallCents } = spendablePerDayByDay({
      days: series(balances),
      today: TODAY,
      until: UNTIL,
    });
    expect(rows).toHaveLength(14);
    expect(shortfallCents).toBe(0);
    expect(rows[0]).toMatchObject({
      daysLeft: 21,
      balanceCents: 105_000,
      perDayCents: 5_000,
    });
    expect(rows[2]?.balanceCents).toBe(105_000);
    // From the 13th on the bill is behind: 105.000 over 18 days.
    expect(rows[3]).toMatchObject({ daysLeft: 18, perDayCents: 5_833 });
    expect(iso(rows[13]?.date ?? TODAY)).toBe("2026-11-23");
  });

  it("ends at the last day with everything left for it", () => {
    const { rows } = spendablePerDayByDay({
      days: series([50_000, 40_000, 30_000], D("2026-11-28")),
      today: D("2026-11-28"),
      until: UNTIL,
    });
    expect(rows.map((row) => iso(row.date))).toEqual([
      "2026-11-28",
      "2026-11-29",
      "2026-11-30",
    ]);
    expect(rows.at(-1)).toMatchObject({ daysLeft: 1, perDayCents: 30_000 });
    expect(rows[0]).toMatchObject({ daysLeft: 3, perDayCents: 10_000 });
  });

  it("reports the shortfall when the forecast goes under zero", () => {
    const balances = Array.from({ length: 21 }, (_, k) =>
      k < 5 ? 100_000 : -30_000,
    );
    const { rows, shortfallCents } = spendablePerDayByDay({
      days: series(balances),
      today: TODAY,
      until: UNTIL,
    });
    expect(shortfallCents).toBe(30_000);
    expect(rows.every((row) => row.perDayCents === 0)).toBe(true);
  });

  it("ignores days before today, after until and without a projection", () => {
    const { rows } = spendablePerDayByDay({
      days: [
        { date: D("2026-11-05"), projectedCents: null },
        { date: D("2026-11-09"), projectedCents: -999_999 },
        { date: D("2026-11-10"), projectedCents: 20_000 },
        { date: D("2026-11-11"), projectedCents: null },
        { date: D("2026-12-01"), projectedCents: -999_999 },
      ],
      today: D("2026-11-10"),
      until: D("2026-11-11"),
    });
    // The 11th has no projection: its row is left out.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ daysLeft: 2, perDayCents: 10_000 });
  });

  it("honors maxDays", () => {
    const { rows } = spendablePerDayByDay({
      days: series(Array(21).fill(1_000)),
      today: TODAY,
      until: UNTIL,
      maxDays: 3,
    });
    expect(rows).toHaveLength(3);
    expect(SPENDABLE_BY_DAY_MAX_DAYS).toBe(14);
  });

  it("rejects what is not integer cents and an until before today", () => {
    expect(() =>
      spendablePerDayByDay({ days: series([1.5]), today: TODAY, until: TODAY }),
    ).toThrow(RangeError);
    expect(() =>
      spendablePerDayByDay({ days: [], today: TODAY, until: D("2026-11-09") }),
    ).toThrow(RangeError);
    expect(() =>
      spendablePerDayByDay({
        days: [],
        today: TODAY,
        until: TODAY,
        maxDays: 1.5,
      }),
    ).toThrow(RangeError);
  });

  it("reads the cash flow: today's row sees its lowest point, the last day the Saldo previsto", () => {
    const pending = [
      { amountCents: -90_000, occurredOn: D("2026-11-15") },
      { amountCents: 300_000, occurredOn: D("2026-11-25") },
    ];
    const invoices = [
      { dueDate: D("2026-11-20"), totalCents: 150_000, paidCents: 0 },
    ];
    const flow = dailyCashFlow({
      period: { start: D("2026-11-01"), end: UNTIL },
      today: TODAY,
      openingCents: 500_000,
      paid: [{ amountCents: -20_000, occurredOn: D("2026-11-03") }],
      pending,
      invoices,
    });
    const { rows } = spendablePerDayByDay({
      days: flow.days,
      today: TODAY,
      until: UNTIL,
    });
    const forecast = forecastBalance({
      balanceCents: 480_000,
      pending,
      invoices,
      until: UNTIL,
    });
    expect(rows[0]?.balanceCents).toBe(flow.lowestProjected?.balanceCents);
    expect(rows[0]?.balanceCents).toBeLessThanOrEqual(forecast.forecastCents);
    expect(flow.endCents).toBe(forecast.forecastCents);
  });
});

describe("spendablePerDayByDay properties", () => {
  const input = fc
    .record({
      startOffset: fc.integer({ min: 0, max: 40 }),
      length: fc.integer({ min: 1, max: 31 }),
      balances: fc.array(fc.integer({ min: -500_000, max: 5_000_000 }), {
        minLength: 31,
        maxLength: 31,
      }),
      maxDays: fc.integer({ min: 1, max: 20 }),
    })
    .map(({ startOffset, length, balances, maxDays }) => {
      const today = addDays(D("2026-01-01"), startOffset);
      return {
        today,
        until: addDays(today, length - 1),
        maxDays,
        days: series(balances.slice(0, length), today),
      };
    });

  it("returns consecutive days from today, within maxDays and until", () => {
    fc.assert(
      fc.property(input, (args) => {
        const { rows } = spendablePerDayByDay(args);
        expect(rows.length).toBeLessThanOrEqual(args.maxDays);
        expect(rows.length).toBeLessThanOrEqual(
          daysBetween(args.today, args.until) + 1,
        );
        rows.forEach((row, k) => {
          expect(iso(row.date)).toBe(iso(addDays(args.today, k)));
          expect(row.daysLeft).toBe(daysBetween(row.date, args.until) + 1);
        });
      }),
    );
  });

  it("never goes negative, nor above the balance's share", () => {
    fc.assert(
      fc.property(input, (args) => {
        const { rows } = spendablePerDayByDay(args);
        for (const row of rows) {
          const fromBalance = spendablePerDay(row.balanceCents, row.daysLeft);
          expect(row.perDayCents).toBeGreaterThanOrEqual(0);
          expect(row.perDayCents).toBeLessThanOrEqual(fromBalance);
          expect(row.perDayCents).toBe(fromBalance);
        }
      }),
    );
  });

  it("uses the lowest balance from the day to the end", () => {
    fc.assert(
      fc.property(input, (args) => {
        const { rows, shortfallCents } = spendablePerDayByDay(args);
        const all = args.days.map((day) => day.projectedCents ?? 0);
        rows.forEach((row, k) => {
          expect(row.balanceCents).toBe(Math.min(...all.slice(k)));
          if (row.balanceCents <= 0) expect(row.perDayCents).toBe(0);
        });
        expect(shortfallCents).toBe(Math.max(0, -Math.min(...all)));
      }),
    );
  });

  it("with a constant balance, today is the plain division and the value never falls", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 1, max: 31 }),
        (balance, length) => {
          const { rows } = spendablePerDayByDay({
            days: series(Array(length).fill(balance)),
            today: TODAY,
            until: addDays(TODAY, length - 1),
          });
          expect(rows[0]?.perDayCents).toBe(spendablePerDay(balance, length));
          rows.slice(1).forEach((row, k) => {
            expect(row.perDayCents).toBeGreaterThanOrEqual(
              rows[k]?.perDayCents ?? 0,
            );
          });
        },
      ),
    );
  });

  it("rejects non-integer balances", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noInteger: true, noNaN: true }),
        (value) => {
          expect(() =>
            spendablePerDayByDay({
              days: [{ date: TODAY, projectedCents: value }],
              today: TODAY,
              until: TODAY,
            }),
          ).toThrow(RangeError);
        },
      ),
    );
  });
});
