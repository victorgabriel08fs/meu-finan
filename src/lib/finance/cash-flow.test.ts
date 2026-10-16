import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type CashFlowInput, dailyCashFlow } from "./cash-flow";
import {
  addDays,
  compare,
  daysBetween,
  iso,
  type LocalDate,
  parse,
} from "./dates";
import { forecastBalance } from "./forecast";

const D = parse;

// Doc 03 §12, mockups on 14/out: 27.670,15 − 2.100,00 − 119,90 − 1.380,42 + 650,00.
const october = { start: D("2026-10-01"), end: D("2026-10-31") };
const mockup: CashFlowInput = {
  period: october,
  today: D("2026-10-14"),
  openingCents: 2_000_000,
  paid: [
    { amountCents: 780_000, occurredOn: D("2026-10-07") },
    { amountCents: -6_450, occurredOn: D("2026-10-14") },
    { amountCents: -6_535, occurredOn: D("2026-10-10") },
  ],
  pending: [
    { amountCents: -210_000, occurredOn: D("2026-10-20") },
    { amountCents: -11_990, occurredOn: D("2026-10-22") },
    { amountCents: 65_000, occurredOn: D("2026-10-28") },
  ],
  invoices: [{ dueDate: D("2026-10-25"), totalCents: 138_042, paidCents: 0 }],
};

const at = (flow: ReturnType<typeof dailyCashFlow>, date: string) =>
  flow.days.find((day) => iso(day.date) === date);

describe("dailyCashFlow (fluxo de caixa diário)", () => {
  it("realizes the balance up to today and projects it to the end of the period", () => {
    const flow = dailyCashFlow(mockup);
    expect(flow.days).toHaveLength(31);
    expect(flow.startCents).toBe(2_000_000);
    expect(at(flow, "2026-10-06")).toEqual({
      date: D("2026-10-06"),
      realizedCents: 2_000_000,
      projectedCents: null,
    });
    expect(at(flow, "2026-10-07")?.realizedCents).toBe(2_780_000);
    // Today: the realized balance of the mockup, and the same projection.
    expect(at(flow, "2026-10-14")).toEqual({
      date: D("2026-10-14"),
      realizedCents: 2_767_015,
      projectedCents: 2_767_015,
    });
    expect(at(flow, "2026-10-15")?.realizedCents).toBeNull();
    expect(at(flow, "2026-10-20")?.projectedCents).toBe(2_557_015);
    expect(at(flow, "2026-10-25")?.projectedCents).toBe(2_406_983);
    // The last day is the "saldo previsto" of Início: R$ 24.719,83.
    expect(flow.endCents).toBe(2_471_983);
    expect(at(flow, "2026-10-31")?.projectedCents).toBe(2_471_983);
  });

  it("finds the lowest realized and projected balances, earliest on ties", () => {
    const flow = dailyCashFlow(mockup);
    expect(flow.lowestProjected).toEqual({
      date: D("2026-10-25"),
      balanceCents: 2_406_983,
    });
    expect(flow.lowestRealized).toEqual({
      date: D("2026-10-01"),
      balanceCents: 2_000_000,
    });
  });

  it("lists what moves the projection by date, then by size", () => {
    const flow = dailyCashFlow({
      ...mockup,
      pending: [
        ...mockup.pending,
        { amountCents: -5_000, occurredOn: D("2026-10-25") },
      ],
    });
    expect(
      flow.scheduled.map((item) => [
        iso(item.date),
        item.amountCents,
        item.source,
        item.index,
      ]),
    ).toEqual([
      ["2026-10-20", -210_000, "pending", 0],
      ["2026-10-22", -11_990, "pending", 1],
      ["2026-10-25", -138_042, "invoice", 0],
      ["2026-10-25", -5_000, "pending", 3],
      ["2026-10-28", 65_000, "pending", 2],
    ]);
  });

  it("lands overdue entries and invoices on today", () => {
    const flow = dailyCashFlow({
      ...mockup,
      pending: [
        ...mockup.pending,
        // Rent of 10/out never marked as paid; a refund of September.
        { amountCents: -210_000, occurredOn: D("2026-10-10") },
        { amountCents: 3_000, occurredOn: D("2026-09-28") },
      ],
      invoices: [
        ...mockup.invoices,
        { dueDate: D("2026-09-25"), totalCents: 20_000, paidCents: 15_000 },
      ],
    });
    const today = at(flow, "2026-10-14");
    expect(today?.realizedCents).toBe(2_767_015);
    expect(today?.projectedCents).toBe(2_767_015 - 210_000 + 3_000 - 5_000);
    const overdue = flow.scheduled.filter((item) => item.overdue);
    expect(overdue.map((item) => [iso(item.date), item.amountCents])).toEqual([
      ["2026-10-14", -210_000],
      ["2026-10-14", -5_000],
      ["2026-10-14", 3_000],
    ]);
  });

  it("does not count card purchases or invoice payments twice", () => {
    const flow = dailyCashFlow({
      ...mockup,
      pending: [
        ...mockup.pending,
        {
          amountCents: -8_740,
          occurredOn: D("2026-10-16"),
          onCreditCard: true,
        },
        {
          amountCents: -138_042,
          occurredOn: D("2026-10-24"),
          paysInvoice: true,
        },
        { amountCents: 0, occurredOn: D("2026-10-18") },
      ],
    });
    expect(flow.endCents).toBe(2_471_983);
    expect(flow.scheduled).toHaveLength(4);
  });

  it("leaves paid invoices out and ignores what falls after the period", () => {
    const flow = dailyCashFlow({
      ...mockup,
      pending: [
        ...mockup.pending,
        { amountCents: -99_000, occurredOn: D("2026-11-01") },
      ],
      invoices: [
        ...mockup.invoices,
        { dueDate: D("2026-10-05"), totalCents: 50_000, paidCents: 50_000 },
        { dueDate: D("2026-11-25"), totalCents: 70_000, paidCents: 0 },
      ],
      paid: [
        ...mockup.paid,
        { amountCents: -1_000, occurredOn: D("2026-09-30") },
        { amountCents: -2_000, occurredOn: D("2026-11-01") },
      ],
    });
    expect(flow.endCents).toBe(2_471_983);
    expect(flow.scheduled).toHaveLength(4);
  });

  it("shows a paid entry dated after today only in the projection", () => {
    const flow = dailyCashFlow({
      ...mockup,
      paid: [
        ...mockup.paid,
        { amountCents: -40_000, occurredOn: D("2026-10-18") },
      ],
    });
    expect(at(flow, "2026-10-14")?.realizedCents).toBe(2_767_015);
    expect(at(flow, "2026-10-18")?.projectedCents).toBe(2_727_015);
    expect(flow.endCents).toBe(2_431_983);
  });

  it("adds up the paid entries of the same day", () => {
    const flow = dailyCashFlow({
      ...mockup,
      paid: [
        ...mockup.paid,
        { amountCents: -1_500, occurredOn: D("2026-10-07") },
        { amountCents: 500, occurredOn: D("2026-10-07") },
      ],
    });
    expect(at(flow, "2026-10-07")?.realizedCents).toBe(2_779_000);
    expect(at(flow, "2026-10-14")?.realizedCents).toBe(2_766_015);
  });

  it("is fully realized for a past period", () => {
    const flow = dailyCashFlow({ ...mockup, today: D("2026-11-03") });
    expect(flow.days.every((day) => day.projectedCents === null)).toBe(true);
    expect(flow.endCents).toBe(2_767_015);
    expect(flow.lowestProjected).toBeNull();
    expect(flow.scheduled).toEqual([]);
  });

  it("is projection only for a period after today", () => {
    const flow = dailyCashFlow({
      period: { start: D("2026-11-01"), end: D("2026-11-30") },
      today: D("2026-10-14"),
      openingCents: 2_767_015,
      paid: [],
      pending: [
        ...mockup.pending,
        { amountCents: -210_000, occurredOn: D("2026-11-15") },
      ],
      invoices: [
        ...mockup.invoices,
        { dueDate: D("2026-11-25"), totalCents: 70_000, paidCents: 0 },
      ],
    });
    expect(flow.days.every((day) => day.realizedCents === null)).toBe(true);
    expect(flow.lowestRealized).toBeNull();
    // October's entries and invoice are already in the starting balance.
    expect(flow.startCents).toBe(2_471_983);
    expect(at(flow, "2026-11-01")?.projectedCents).toBe(2_471_983);
    expect(at(flow, "2026-11-15")?.projectedCents).toBe(2_261_983);
    expect(flow.endCents).toBe(2_191_983);
    expect(flow.lowestProjected).toEqual({
      date: D("2026-11-25"),
      balanceCents: 2_191_983,
    });
    expect(flow.scheduled.map((item) => iso(item.date))).toEqual([
      "2026-11-15",
      "2026-11-25",
    ]);
  });

  it("projects a one-day period that is today", () => {
    const flow = dailyCashFlow({
      period: { start: D("2026-10-14"), end: D("2026-10-14") },
      today: D("2026-10-14"),
      openingCents: 100,
      paid: [{ amountCents: 50, occurredOn: D("2026-10-14") }],
      pending: [{ amountCents: -30, occurredOn: D("2026-10-14") }],
      invoices: [],
    });
    expect(flow.days).toEqual([
      { date: D("2026-10-14"), realizedCents: 150, projectedCents: 120 },
    ]);
    expect(flow.endCents).toBe(120);
  });

  it("rejects invalid input", () => {
    expect(() =>
      dailyCashFlow({
        ...mockup,
        period: { start: D("2026-10-31"), end: D("2026-10-01") },
      }),
    ).toThrow(/period.end/);
    expect(() =>
      dailyCashFlow({ ...mockup, today: { year: 2026, month: 2, day: 30 } }),
    ).toThrow(RangeError);
    expect(() => dailyCashFlow({ ...mockup, openingCents: 0.5 })).toThrow(
      /openingCents/,
    );
    expect(() =>
      dailyCashFlow({
        ...mockup,
        paid: [{ amountCents: 1.5, occurredOn: D("2026-10-02") }],
      }),
    ).toThrow(/paid.amountCents/);
    expect(() =>
      dailyCashFlow({
        ...mockup,
        paid: [
          { amountCents: 1, occurredOn: { year: 2026, month: 13, day: 1 } },
        ],
      }),
    ).toThrow(RangeError);
    expect(() =>
      dailyCashFlow({
        ...mockup,
        today: D("2026-11-03"),
        pending: [{ amountCents: Number.NaN, occurredOn: D("2026-10-20") }],
      }),
    ).toThrow(/pending.amountCents/);
    expect(() =>
      dailyCashFlow({
        ...mockup,
        openingCents: Number.MAX_SAFE_INTEGER,
        paid: [{ amountCents: 1, occurredOn: D("2026-10-02") }],
      }),
    ).toThrow(/balance/);
  });
});

describe("dailyCashFlow properties", () => {
  const RUNS = { numRuns: 200 };
  const EPOCH = { year: 2026, month: 1, day: 1 };
  const day = (max: number) =>
    fc.integer({ min: 0, max }).map((offset) => addDays(EPOCH, offset));
  const cents = fc.integer({ min: -500_000, max: 500_000 });

  const input = fc
    .record({
      startOffset: fc.integer({ min: 0, max: 60 }),
      length: fc.integer({ min: 1, max: 31 }),
      today: day(120),
      openingCents: fc.integer({ min: -1_000_000, max: 5_000_000 }),
      paid: fc.array(fc.record({ amountCents: cents, occurredOn: day(120) }), {
        maxLength: 20,
      }),
      pending: fc.array(
        fc.record({
          amountCents: cents,
          occurredOn: day(120),
          onCreditCard: fc.boolean(),
          paysInvoice: fc.boolean(),
        }),
        { maxLength: 12 },
      ),
      invoices: fc.array(
        fc.record({
          dueDate: day(120),
          totalCents: fc.integer({ min: 0, max: 300_000 }),
          paidCents: fc.integer({ min: 0, max: 300_000 }),
        }),
        { maxLength: 4 },
      ),
    })
    .map(
      (raw): CashFlowInput => ({
        period: {
          start: addDays(EPOCH, raw.startOffset),
          end: addDays(EPOCH, raw.startOffset + raw.length - 1),
        },
        today: raw.today,
        openingCents: raw.openingCents,
        paid: raw.paid,
        pending: raw.pending,
        invoices: raw.invoices,
      }),
    );

  const inside = (date: LocalDate, start: LocalDate, end: LocalDate) =>
    compare(start, date) <= 0 && compare(date, end) <= 0;

  it("ends on the forecast of Início whenever the period reaches today", () => {
    fc.assert(
      fc.property(input, (args) => {
        const flow = dailyCashFlow(args);
        if (compare(args.today, args.period.end) > 0) {
          return flow.days.every((d) => d.projectedCents === null);
        }
        const paidInPeriod = args.paid
          .filter((entry) =>
            inside(entry.occurredOn, args.period.start, args.period.end),
          )
          .reduce((sum, entry) => sum + entry.amountCents, 0);
        const forecast = forecastBalance({
          balanceCents: args.openingCents + paidInPeriod,
          pending: args.pending,
          invoices: args.invoices,
          until: args.period.end,
        });
        return flow.endCents === forecast.forecastCents;
      }),
      RUNS,
    );
  });

  it("moves the realized balance by exactly each day's paid entries", () => {
    fc.assert(
      fc.property(input, (args) => {
        const flow = dailyCashFlow(args);
        let previous = args.openingCents;
        for (const d of flow.days) {
          const expected =
            previous +
            args.paid
              .filter((entry) => compare(entry.occurredOn, d.date) === 0)
              .reduce((sum, entry) => sum + entry.amountCents, 0);
          const isPast = compare(d.date, args.today) <= 0;
          if (isPast !== (d.realizedCents !== null)) return false;
          if (d.realizedCents !== null && d.realizedCents !== expected) {
            return false;
          }
          previous = expected;
        }
        return true;
      }),
      RUNS,
    );
  });

  it("has one day per date, and its lowest points are the minima", () => {
    fc.assert(
      fc.property(input, (args) => {
        const flow = dailyCashFlow(args);
        const length = daysBetween(args.period.start, args.period.end) + 1;
        if (flow.days.length !== length) return false;
        for (const [key, low] of [
          ["realizedCents", flow.lowestRealized],
          ["projectedCents", flow.lowestProjected],
        ] as const) {
          const values = flow.days
            .map((d) => d[key])
            .filter((value): value is number => value !== null);
          if (values.length === 0) {
            if (low !== null) return false;
          } else if (low?.balanceCents !== Math.min(...values)) {
            return false;
          }
        }
        return flow.scheduled.every(
          (item) =>
            inside(item.date, args.period.start, args.period.end) &&
            compare(item.date, args.today) >= 0,
        );
      }),
      RUNS,
    );
  });
});
