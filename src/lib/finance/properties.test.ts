import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  atDay,
  compare,
  futureValue,
  invoiceFor,
  invoiceForReferenceMonth,
  isValidCardCycle,
  type LocalDate,
  occurrencesBetween,
  periodContaining,
  periodsToReach,
  type Recurrence,
  requiredPayment,
  shiftPeriod,
  simulate,
  solveMonthly,
  solveMonths,
  splitInstallments,
} from "./index";

/**
 * Doc 03 §13.2. Amounts and rates come from integer generators (cents, basis
 * points) so the cases look like real input; tolerances are relative because
 * balances reach 1.05^600 ≈ 5·10¹² times the input.
 */

const RUNS = { numRuns: 200 };

const closeEnough = (a: number, b: number, relative = 1e-9) =>
  Math.abs(a - b) <= relative * Math.max(1, Math.abs(a), Math.abs(b));

/** Amount in reais with cents: 0 … 1.000.000,00. */
const reais = (max = 100_000_000) =>
  fc.integer({ min: 0, max }).map((cents) => cents / 100);
/** Monthly rate 0% … 5% in steps of 0.01%. */
const monthlyRate = fc.integer({ min: 0, max: 500 }).map((bp) => bp / 10_000);
const timing = fc.constantFrom("start" as const, "end" as const);

const EPOCH = { year: 2000, month: 1, day: 1 };
/** Any date from 2000 to the end of 2059. */
const localDate = fc
  .integer({ min: 0, max: 21_914 })
  .map((offset) => addDays(EPOCH, offset));

describe("simulate equals the closed form", () => {
  it("without tax or growth, for PV, PMT ≥ 0, rate ∈ [0, 5% a.m.] and n ∈ [0, 600]", () => {
    fc.assert(
      fc.property(
        reais(),
        reais(1_000_000),
        monthlyRate,
        fc.integer({ min: 0, max: 600 }),
        timing,
        (pv, pmt, i, n, when) => {
          const loop = simulate({
            initial: pv,
            monthly: pmt,
            months: n,
            rate: { kind: "monthly", value: i },
            timing: when,
          }).final.gross;
          const closed = futureValue(pv, pmt, i, n, when);
          // Relative 1e-6 (absolute below R$ 1): the loop drifts ~n·ε.
          return closeEnough(loop, closed, 1e-6);
        },
      ),
      RUNS,
    );
  });
});

describe("reverse calculations", () => {
  it("simulate(requiredPayment(...)) reaches the target", () => {
    fc.assert(
      fc.property(
        reais(),
        reais(),
        monthlyRate,
        fc.integer({ min: 1, max: 600 }),
        timing,
        (pv, extra, i, n, when) => {
          const target = pv + extra + 0.01;
          const pmt = requiredPayment(target, pv, i, n, when);
          const gross = simulate({
            initial: pv,
            monthly: pmt,
            months: n,
            rate: { kind: "monthly", value: i },
            timing: when,
          }).final.gross;
          return gross >= target * (1 - 1e-9);
        },
      ),
      RUNS,
    );
  });

  it("solveMonthly matches requiredPayment rounded up to the cent", () => {
    fc.assert(
      fc.property(
        reais(),
        fc.integer({ min: 1, max: 100_000_000 }),
        monthlyRate,
        fc.integer({ min: 1, max: 360 }),
        (pv, extraCents, i, n) => {
          const target = pv + extraCents / 100;
          const formula = requiredPayment(target, pv, i, n);
          const solved = solveMonthly(
            target,
            { initial: pv, months: n, rate: { kind: "monthly", value: i } },
            "gross",
          );
          // The loop and the formula differ by float noise (~n·ε of the target).
          const noise = 1e-10 * Math.max(1, target);
          expect(solved).not.toBeNull();
          expect(solved).toBeGreaterThanOrEqual(formula - noise);
          expect(solved).toBeLessThanOrEqual(formula + 0.01 + noise);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("periodsToReach is the smallest whole number of months that reaches the target (= solveMonths)", () => {
    fc.assert(
      fc.property(
        reais(),
        fc.integer({ min: 100, max: 1_000_000 }).map((cents) => cents / 100),
        fc.double({ min: 0.001, max: 1, noNaN: true }),
        monthlyRate,
        (pv, pmt, share, i) => {
          // The target is reachable within 600 months even at 0%.
          const target = pv + Math.max(0.01, share * pmt * 600);
          const exact = periodsToReach(target, pv, pmt, i);
          expect(exact).not.toBeNull();
          const months = Math.ceil((exact ?? 0) - 1e-9);
          const gross = (n: number) =>
            simulate({
              initial: pv,
              monthly: pmt,
              months: n,
              rate: { kind: "monthly", value: i },
            }).final.gross;
          expect(months).toBeGreaterThanOrEqual(1);
          expect(gross(months)).toBeGreaterThanOrEqual(target * (1 - 1e-9));
          expect(gross(months - 1)).toBeLessThan(target * (1 + 1e-9));
          // Away from float ties (exact whole months), the solver agrees.
          const exactValue = exact ?? 0;
          if (Math.abs(exactValue - Math.round(exactValue)) > 1e-6) {
            const solved = solveMonths(
              target,
              {
                initial: pv,
                monthly: pmt,
                rate: { kind: "monthly", value: i },
              },
              "gross",
            );
            expect(solved).toBe(months);
          }
        },
      ),
      RUNS,
    );
  });
});

describe("net value with regressive income tax", () => {
  const base = (i: number, pv: number, pmt: number, when: "start" | "end") => ({
    initial: pv,
    monthly: pmt,
    rate: { kind: "monthly" as const, value: i },
    timing: when,
    tax: "regressive" as const,
  });

  it("final.net does not decrease when months grow", () => {
    fc.assert(
      fc.property(
        reais(),
        reais(1_000_000),
        monthlyRate,
        fc.integer({ min: 0, max: 599 }),
        timing,
        (pv, pmt, i, n, when) => {
          const now = simulate({ ...base(i, pv, pmt, when), months: n });
          const later = simulate({ ...base(i, pv, pmt, when), months: n + 1 });
          return later.final.net >= now.final.net * (1 - 1e-12);
        },
      ),
      RUNS,
    );
  });

  it("final.net does not decrease when the monthly contribution grows", () => {
    fc.assert(
      fc.property(
        reais(),
        reais(1_000_000),
        reais(1_000_000),
        monthlyRate,
        fc.integer({ min: 0, max: 600 }),
        timing,
        (pv, pmt, more, i, n, when) => {
          const low = simulate({ ...base(i, pv, pmt, when), months: n });
          const high = simulate({
            ...base(i, pv, pmt + more, when),
            months: n,
          });
          return high.final.net >= low.final.net * (1 - 1e-12);
        },
      ),
      RUNS,
    );
  });

  it("final.tax ≥ 0 and net ≥ invested (rate ≥ 0); tax ≥ 0 even with negative rates", () => {
    fc.assert(
      fc.property(
        reais(),
        reais(1_000_000),
        fc.integer({ min: -500, max: 500 }).map((bp) => bp / 10_000),
        fc.integer({ min: 0, max: 600 }),
        timing,
        (pv, pmt, i, n, when) => {
          const { final } = simulate({ ...base(i, pv, pmt, when), months: n });
          expect(final.tax).toBeGreaterThanOrEqual(0);
          expect(final.net).toBeLessThanOrEqual(final.gross);
          if (i >= 0) {
            expect(final.net).toBeGreaterThanOrEqual(
              final.invested * (1 - 1e-12),
            );
          }
        },
      ),
      RUNS,
    );
  });
});

describe("installments", () => {
  it("Σ splitInstallments(total, n) === total and each one is base … base + n − 1", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000_000, max: 100_000_000 }),
        fc.integer({ min: 1, max: 72 }),
        (total, count) => {
          const parts = splitInstallments(total, count);
          expect(parts).toHaveLength(count);
          expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
          const base = Math.floor(Math.abs(total) / count);
          for (const part of parts) {
            expect(Number.isInteger(part)).toBe(true);
            expect(Math.sign(part) * Math.sign(total)).toBeGreaterThanOrEqual(
              0,
            );
            const extra = Math.abs(part) - base;
            expect(extra).toBeGreaterThanOrEqual(0);
            expect(extra).toBeLessThanOrEqual(count - 1);
          }
          // The remainder goes to the first installment only.
          expect(parts.slice(1).every((part) => Math.abs(part) === base)).toBe(
            true,
          );
        },
      ),
      RUNS,
    );
  });
});

describe("invoices", () => {
  const cardCycle = fc
    .record({
      closingDay: fc.integer({ min: 1, max: 31 }),
      dueDay: fc.integer({ min: 1, max: 31 }),
    })
    .filter(isValidCardCycle);

  it("the due date is always after the closing date, which is on or after the purchase", () => {
    fc.assert(
      fc.property(localDate, cardCycle, (purchase, card) => {
        const invoice = invoiceFor(purchase, card);
        expect(compare(invoice.closingDate, invoice.dueDate)).toBe(-1);
        expect(compare(purchase, invoice.closingDate)).toBe(-1);
        expect(invoice.referenceMonth).toEqual({
          year: invoice.dueDate.year,
          month: invoice.dueDate.month,
        });
        // The reference month alone recovers the same invoice.
        expect(invoiceForReferenceMonth(invoice.referenceMonth, card)).toEqual(
          invoice,
        );
      }),
      RUNS,
    );
  });

  it("invoices of purchases in increasing dates never go back", () => {
    fc.assert(
      fc.property(
        localDate,
        fc.integer({ min: 0, max: 400 }),
        cardCycle,
        (first, gap, card) => {
          const a = invoiceFor(first, card);
          const b = invoiceFor(addDays(first, gap), card);
          expect(compare(a.closingDate, b.closingDate)).toBeLessThanOrEqual(0);
          expect(compare(a.dueDate, b.dueDate)).toBeLessThanOrEqual(0);
        },
      ),
      RUNS,
    );
  });
});

describe("recurrence", () => {
  // The window starts at `from`; start and end land around it so that rules
  // starting before, inside and after the window (and ending anywhere) occur.
  const ruleAndWindow = fc
    .record(
      {
        from: localDate,
        span: fc.integer({ min: 0, max: 1500 }),
        startOffset: fc.integer({ min: -2000, max: 1600 }),
        endOffset: fc.integer({ min: -100, max: 2000 }),
        freq: fc.constantFrom(
          "daily" as const,
          "weekly" as const,
          "monthly" as const,
          "yearly" as const,
        ),
        interval: fc.integer({ min: 1, max: 12 }),
        byMonthDay: fc.integer({ min: 1, max: 31 }),
      },
      { requiredKeys: ["from", "span", "startOffset", "freq", "interval"] },
    )
    .map(({ from, span, startOffset, endOffset, ...rest }) => {
      const start = addDays(from, startOffset);
      const r: Recurrence = { ...rest, start };
      if (endOffset !== undefined) r.end = addDays(start, endOffset);
      return { r, from, to: addDays(from, span) };
    });

  /** Doc 03 §10.1 enumeration, plus the rule that nothing precedes `start`. */
  function naive(r: Recurrence, from: LocalDate, to: LocalDate) {
    const out: LocalDate[] = [];
    for (let k = 0; ; k++) {
      let d: LocalDate;
      if (r.freq === "daily") d = addDays(r.start, k * r.interval);
      else if (r.freq === "weekly") d = addDays(r.start, 7 * k * r.interval);
      else {
        const step = (r.freq === "monthly" ? 1 : 12) * k * r.interval;
        const month = addMonths(r.start, step);
        d = atDay(month.year, month.month, r.byMonthDay ?? r.start.day);
      }
      if (compare(d, to) > 0 || (r.end && compare(d, r.end) > 0)) break;
      if (compare(d, from) >= 0 && compare(d, r.start) >= 0) out.push(d);
    }
    return out;
  }

  it("dates strictly increase and none falls outside [from, to], before start or after end", () => {
    fc.assert(
      fc.property(ruleAndWindow, ({ r, from, to }) => {
        const dates = occurrencesBetween(r, from, to);
        for (const [index, date] of dates.entries()) {
          expect(compare(date, from)).toBeGreaterThanOrEqual(0);
          expect(compare(date, to)).toBeLessThanOrEqual(0);
          expect(compare(date, r.start)).toBeGreaterThanOrEqual(0);
          if (r.end) expect(compare(date, r.end)).toBeLessThanOrEqual(0);
          if (index > 0) expect(compare(dates[index - 1], date)).toBe(-1);
        }
        expect(dates).toEqual(naive(r, from, to));
      }),
      RUNS,
    );
  });
});

describe("financial month", () => {
  const startDay = fc.integer({ min: 1, max: 28 });

  it("periodContaining(d) contains d, and consecutive periods neither overlap nor leave a gap", () => {
    fc.assert(
      fc.property(localDate, startDay, (date, day) => {
        const period = periodContaining(date, day);
        expect(compare(period.start, date)).toBeLessThanOrEqual(0);
        expect(compare(date, period.end)).toBeLessThanOrEqual(0);
        expect(period.start.day).toBe(day);

        const next = periodContaining(addDays(period.end, 1), day);
        expect(next.start).toEqual(addDays(period.end, 1));
        expect(next.label).toEqual(addMonths(period.label, 1));
        expect(shiftPeriod(period, 1)).toEqual(next);
        expect(shiftPeriod(next, -1)).toEqual(period);
        expect(periodContaining(period.start, day)).toEqual(period);
        expect(periodContaining(period.end, day)).toEqual(period);
      }),
      RUNS,
    );
  });
});
