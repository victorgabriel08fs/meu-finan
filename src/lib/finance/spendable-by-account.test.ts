import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type CashMovement, dailyCashFlow } from "./cash-flow";
import { addDays, compare, iso, type LocalDate, parse } from "./dates";
import type { InvoiceObligation, PendingEntry } from "./forecast";
import { invoiceOutstandingCents } from "./invoices";
import {
  attributeInvoices,
  type InvoiceToAttribute,
  invoicePayer,
  type SpendableAccountInput,
  type SpendableByAccountInput,
  spendableAccountSeries,
  spendablePerDayByAccount,
} from "./spendable-by-account";
import { spendablePerDayByDay } from "./spendable-by-day";

const D = parse;
const TODAY = D("2026-11-10");
const UNTIL = D("2026-11-30");

const account = (
  id: string,
  balanceCents: number,
  extra: Partial<SpendableAccountInput> = {},
): SpendableAccountInput => ({
  id,
  balanceCents,
  paidFromToday: [],
  pending: [],
  ...extra,
});

const invoice = (
  cardId: string,
  dueDate: string,
  totalCents: number,
  extra: Partial<InvoiceToAttribute> = {},
): InvoiceToAttribute => ({
  cardId,
  dueDate: D(dueDate),
  totalCents,
  paidCents: 0,
  scheduled: [],
  ...extra,
});

const run = (input: Partial<SpendableByAccountInput>) =>
  spendablePerDayByAccount({
    accounts: [],
    invoices: [],
    payerByCard: new Map(),
    today: TODAY,
    until: UNTIL,
    ...input,
  });

const projectedOn = (
  days: { date: LocalDate; projectedCents: number | null }[],
  date: string,
) => days.find((day) => iso(day.date) === date)?.projectedCents;

describe("invoicePayer", () => {
  const spendableIds = new Set(["checking", "wallet"]);

  it("takes the account chosen on the card", () => {
    expect(
      invoicePayer({
        configuredId: "wallet",
        lastPaidFromId: "checking",
        spendableIds,
      }),
    ).toBe("wallet");
  });

  it("does not fall back to the last payment when the chosen one is not for spending", () => {
    expect(
      invoicePayer({
        configuredId: "box",
        lastPaidFromId: "checking",
        spendableIds,
      }),
    ).toBeNull();
  });

  it("uses the last payment without a chosen account, if it is for spending", () => {
    expect(invoicePayer({ lastPaidFromId: "checking", spendableIds })).toBe(
      "checking",
    );
    expect(
      invoicePayer({ configuredId: null, lastPaidFromId: "box", spendableIds }),
    ).toBeNull();
    expect(invoicePayer({ spendableIds })).toBeNull();
  });
});

describe("attributeInvoices", () => {
  const spendableIds = new Set(["a", "b"]);

  it("splits the scheduled payments first, the rest to the payer", () => {
    const { byAccount, unassigned } = attributeInvoices({
      invoices: [
        invoice("card", "2026-11-20", 50_000, {
          paidCents: 10_000,
          scheduled: [
            { fromAccountId: "a", amountCents: 15_000 },
            { fromAccountId: "b", amountCents: 10_000 },
          ],
        }),
      ],
      payerByCard: new Map([["card", "b"]]),
      spendableIds,
    });
    expect(byAccount.get("a")).toEqual([
      { dueDate: D("2026-11-20"), totalCents: 15_000, paidCents: 0 },
    ]);
    expect(byAccount.get("b")?.map((part) => part.totalCents)).toEqual([
      10_000, 15_000,
    ]);
    expect(unassigned).toEqual([]);
  });

  it("caps the scheduled parts at what is owed", () => {
    const { byAccount } = attributeInvoices({
      invoices: [
        invoice("card", "2026-11-20", 20_000, {
          scheduled: [
            { fromAccountId: "a", amountCents: 15_000 },
            { fromAccountId: "b", amountCents: 15_000 },
          ],
        }),
      ],
      payerByCard: new Map([["card", "a"]]),
      spendableIds,
    });
    expect(byAccount.get("a")?.map((part) => part.totalCents)).toEqual([
      15_000,
    ]);
    expect(byAccount.get("b")?.map((part) => part.totalCents)).toEqual([5_000]);
  });

  it("leaves a part paid from a caixinha, or with no payer, unassigned", () => {
    const { byAccount, unassigned } = attributeInvoices({
      invoices: [
        invoice("card", "2026-11-20", 30_000, {
          scheduled: [{ fromAccountId: "box", amountCents: 20_000 }],
        }),
      ],
      payerByCard: new Map(),
      spendableIds,
    });
    expect(byAccount.size).toBe(0);
    expect(
      unassigned.map((part) => [part.cardId, part.obligation.totalCents]),
    ).toEqual([
      ["card", 20_000],
      ["card", 10_000],
    ]);
  });

  it("skips a paid invoice", () => {
    const { byAccount, unassigned } = attributeInvoices({
      invoices: [invoice("card", "2026-11-20", 30_000, { paidCents: 30_000 })],
      payerByCard: new Map([["card", "a"]]),
      spendableIds,
    });
    expect(byAccount.size).toBe(0);
    expect(unassigned).toEqual([]);
  });

  it("rejects a negative scheduled amount", () => {
    expect(() =>
      attributeInvoices({
        invoices: [
          invoice("card", "2026-11-20", 30_000, {
            scheduled: [{ fromAccountId: "a", amountCents: -1 }],
          }),
        ],
        payerByCard: new Map(),
        spendableIds,
      }),
    ).toThrow(RangeError);
  });
});

describe("spendablePerDayByAccount", () => {
  it("moves a scheduled transfer out of one account and into the other", () => {
    const day15 = D("2026-11-15");
    const { accounts } = run({
      accounts: [
        account("a", 100_000, {
          pending: [{ amountCents: -30_000, occurredOn: day15 }],
        }),
        account("b", 0, {
          pending: [{ amountCents: 30_000, occurredOn: day15 }],
        }),
      ],
    });
    const [a, b] = accounts;
    // 70.000 over the 21 days from the 10th to the 30th.
    expect(a?.rows[0]).toMatchObject({
      balanceCents: 70_000,
      perDayCents: 3_333,
    });
    // Nothing in B until the 15th, so nothing to spend before it.
    expect(b?.rows[0]).toMatchObject({ balanceCents: 0, perDayCents: 0 });
    // From the 15th, 30.000 over 16 days.
    expect(b?.rows[5]).toMatchObject({ daysLeft: 16, perDayCents: 1_875 });
  });

  it("charges the invoice to the account that pays it", () => {
    const series = spendableAccountSeries({
      accounts: [account("a", 100_000), account("b", 50_000)],
      invoices: [invoice("card", "2026-11-20", 40_000)],
      payerByCard: new Map([["card", "a"]]),
      today: TODAY,
      until: UNTIL,
    });
    const [a, b] = series.accounts;
    expect(projectedOn(a?.days ?? [], "2026-11-19")).toBe(100_000);
    expect(projectedOn(a?.days ?? [], "2026-11-20")).toBe(60_000);
    expect(projectedOn(b?.days ?? [], "2026-11-30")).toBe(50_000);
    expect(series.unassignedDays.every((day) => day.projectedCents === 0)).toBe(
      true,
    );
  });

  it("splits a scheduled payment between two accounts, the rest to the payer", () => {
    const series = spendableAccountSeries({
      accounts: [account("a", 100_000), account("b", 100_000)],
      invoices: [
        invoice("card", "2026-11-20", 50_000, {
          scheduled: [
            { fromAccountId: "a", amountCents: 20_000 },
            { fromAccountId: "b", amountCents: 10_000 },
          ],
        }),
      ],
      payerByCard: new Map([["card", "b"]]),
      today: TODAY,
      until: UNTIL,
    });
    const [a, b] = series.accounts;
    expect(projectedOn(a?.days ?? [], "2026-11-30")).toBe(80_000);
    // 10.000 scheduled plus the 20.000 left.
    expect(projectedOn(b?.days ?? [], "2026-11-30")).toBe(70_000);
  });

  it("leaves the part paid from a caixinha in the total only, and names the card", () => {
    const result = run({
      accounts: [account("a", 100_000), account("b", 0)],
      invoices: [
        invoice("card", "2026-11-20", 30_000, {
          scheduled: [{ fromAccountId: "box", amountCents: 30_000 }],
        }),
      ],
      payerByCard: new Map([["card", "a"]]),
    });
    expect(result.accounts[0]?.rows[0]?.balanceCents).toBe(100_000);
    expect(result.unassignedCardIds).toEqual(["card"]);
  });

  it("names an overdue card without payer, not one due after the month", () => {
    const result = run({
      accounts: [account("a", 100_000), account("b", 0)],
      invoices: [
        invoice("late", "2026-11-05", 10_000),
        invoice("late", "2026-11-25", 10_000),
        invoice("next", "2026-12-05", 10_000),
      ],
    });
    expect(result.unassignedCardIds).toEqual(["late"]);
  });

  it("takes a paid entry dated ahead out of the days before it", () => {
    const series = spendableAccountSeries({
      accounts: [
        account("a", 100_000, {
          paidFromToday: [
            { amountCents: -5_000, occurredOn: D("2026-11-12") },
            // Before today: already in the balance, and ignored.
            { amountCents: -9_000, occurredOn: D("2026-11-01") },
          ],
        }),
      ],
      invoices: [],
      payerByCard: new Map(),
      today: TODAY,
      until: UNTIL,
    });
    const days = series.accounts[0]?.days ?? [];
    expect(projectedOn(days, "2026-11-11")).toBe(105_000);
    expect(projectedOn(days, "2026-11-12")).toBe(100_000);
  });

  it("gives one row on the last day of the month", () => {
    const { accounts } = run({
      accounts: [account("a", 4_000), account("b", -1_000)],
      today: UNTIL,
    });
    expect(accounts[0]?.rows).toEqual([
      { date: UNTIL, daysLeft: 1, balanceCents: 4_000, perDayCents: 4_000 },
    ]);
    expect(accounts[1]?.rows[0]?.perDayCents).toBe(0);
    expect(accounts[1]?.shortfallCents).toBe(1_000);
  });

  it("rejects repeated ids and amounts that are not whole cents", () => {
    expect(() => run({ accounts: [account("a", 0), account("a", 0)] })).toThrow(
      RangeError,
    );
    expect(() => run({ accounts: [account("a", 10.5)] })).toThrow(RangeError);
    expect(() =>
      run({
        accounts: [
          account("a", 0, {
            paidFromToday: [{ amountCents: 0.5, occurredOn: TODAY }],
          }),
        ],
      }),
    ).toThrow(RangeError);
    expect(() =>
      run({ accounts: [account("a", 0)], until: D("2026-11-09") }),
    ).toThrow(RangeError);
  });
});

// Properties --------------------------------------------------------------------

const ACCOUNT_IDS = ["a0", "a1", "a2", "a3"];
const CARD_IDS = ["c0", "c1", "c2"];
/** Not a spendable account: a caixinha or an account out of the net worth. */
const BOX = "box";

type Scenario = SpendableByAccountInput & {
  /** Every account's pending entries, transfers in pairs (−x / +x). */
  allPending: PendingEntry[];
  allPaid: CashMovement[];
};

const cents = (max: number) => fc.integer({ min: -max, max });

const scenario = (options: { assigned?: boolean; still?: boolean } = {}) =>
  fc
    .record({
      startOffset: fc.integer({ min: 0, max: 60 }),
      length: fc.integer({ min: 1, max: 31 }),
      count: fc.integer({ min: 1, max: 4 }),
      balances: fc.array(cents(2_000_000), { minLength: 4, maxLength: 4 }),
      paid: fc.array(
        fc.record({
          who: fc.nat(3),
          amount: cents(200_000),
          offset: fc.integer({ min: 0, max: 35 }),
        }),
        { maxLength: 6 },
      ),
      pending: fc.array(
        fc.record({
          who: fc.nat(3),
          amount: cents(300_000),
          offset: fc.integer({ min: -5, max: 35 }),
          paysInvoice: fc.boolean(),
          onCreditCard: fc.boolean(),
        }),
        { maxLength: 8 },
      ),
      transfers: fc.array(
        fc.record({
          from: fc.nat(3),
          to: fc.nat(3),
          amount: fc.integer({ min: 1, max: 300_000 }),
          offset: fc.integer({ min: -5, max: 35 }),
        }),
        { maxLength: 4 },
      ),
      invoices: fc.array(
        fc.record({
          card: fc.nat(2),
          dueOffset: fc.integer({ min: -10, max: 45 }),
          total: fc.integer({ min: 0, max: 500_000 }),
          paid: fc.integer({ min: 0, max: 500_000 }),
          scheduled: fc.array(
            fc.record({
              who: fc.integer({ min: 0, max: 4 }),
              amount: fc.integer({ min: 0, max: 300_000 }),
            }),
            { maxLength: 3 },
          ),
        }),
        { maxLength: 5 },
      ),
      payers: fc.array(fc.integer({ min: -1, max: 4 }), {
        minLength: 3,
        maxLength: 3,
      }),
    })
    .map((raw): Scenario => {
      const today = addDays(D("2026-01-01"), raw.startOffset);
      const until = addDays(today, raw.length - 1);
      const ids = ACCOUNT_IDS.slice(0, raw.count);
      // Index → an account in the scenario, or the caixinha (unless assigned).
      const who = (index: number) =>
        options.assigned
          ? (ids[index % ids.length] as string)
          : (ids[index] ?? BOX);
      const paidOf = new Map<string, CashMovement[]>();
      const pendingOf = new Map<string, PendingEntry[]>();
      const push = <T>(map: Map<string, T[]>, id: string, item: T) =>
        map.set(id, [...(map.get(id) ?? []), item]);
      if (!options.still) {
        for (const item of raw.paid) {
          const id = ids[item.who % ids.length] as string;
          push(paidOf, id, {
            amountCents: item.amount,
            occurredOn: addDays(today, item.offset),
          });
        }
        for (const item of raw.pending) {
          const id = ids[item.who % ids.length] as string;
          push(pendingOf, id, {
            amountCents: item.amount,
            occurredOn: addDays(today, item.offset),
            paysInvoice: item.paysInvoice,
            onCreditCard: item.onCreditCard,
          });
        }
        for (const item of raw.transfers) {
          const from = ids[item.from % ids.length] as string;
          const to = ids[item.to % ids.length] as string;
          const occurredOn = addDays(today, item.offset);
          push(pendingOf, from, { amountCents: -item.amount, occurredOn });
          push(pendingOf, to, { amountCents: item.amount, occurredOn });
        }
      }
      const accounts = ids.map((id, index) =>
        account(id, raw.balances[index] ?? 0, {
          paidFromToday: paidOf.get(id) ?? [],
          pending: pendingOf.get(id) ?? [],
        }),
      );
      const invoices = options.still
        ? []
        : raw.invoices.map((item) => ({
            cardId: CARD_IDS[item.card] as string,
            dueDate: addDays(today, item.dueOffset),
            totalCents: item.total,
            paidCents: item.paid,
            scheduled: item.scheduled.map((part) => ({
              fromAccountId: who(part.who),
              amountCents: part.amount,
            })),
          }));
      const payerByCard = new Map(
        CARD_IDS.map((cardId, index) => {
          const payer = raw.payers[index] ?? -1;
          if (options.assigned) return [cardId, who(Math.max(0, payer))];
          return [cardId, payer < 0 ? null : who(payer)];
        }),
      );
      return {
        accounts,
        invoices,
        payerByCard,
        today,
        until,
        allPending: accounts.flatMap((item) => [...item.pending]),
        allPaid: accounts.flatMap((item) => [...item.paidFromToday]),
      };
    });

/** The total, as the Fluxo computes it: every account and invoice together. */
function totalFlow(input: Scenario) {
  const openingCents = input.accounts.reduce(
    (sum, item) =>
      sum +
      item.balanceCents -
      item.paidFromToday.reduce((paid, entry) => paid + entry.amountCents, 0),
    0,
  );
  return dailyCashFlow({
    period: { start: input.today, end: input.until },
    today: input.today,
    openingCents,
    paid: input.allPaid,
    pending: input.allPending,
    invoices: input.invoices.map(
      (item): InvoiceObligation => ({
        dueDate: item.dueDate,
        totalCents: item.totalCents,
        paidCents: item.paidCents,
      }),
    ),
  });
}

const partsOf = (map: Map<string, InvoiceObligation[]>) =>
  [...map.values()].flat();
const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

describe("spendable by account properties", () => {
  it("(a) each day, the accounts plus the unassigned parts are the total forecast", () => {
    fc.assert(
      fc.property(scenario(), (input) => {
        const series = spendableAccountSeries(input);
        const total = totalFlow(input);
        total.days.forEach((day, k) => {
          const parts =
            sum(
              series.accounts.map((item) => item.days[k]?.projectedCents ?? 0),
            ) + (series.unassignedDays[k]?.projectedCents ?? 0);
          expect(parts).toBe(day.projectedCents);
        });
      }),
    );
  });

  it("(b) the parts add up to what is owed, each positive, each to a spendable account", () => {
    fc.assert(
      fc.property(scenario(), (input) => {
        const spendableIds = new Set(input.accounts.map((item) => item.id));
        const { byAccount, unassigned } = attributeInvoices({
          invoices: input.invoices,
          payerByCard: input.payerByCard,
          spendableIds,
        });
        const parts = [
          ...partsOf(byAccount),
          ...unassigned.map((part) => part.obligation),
        ];
        expect(sum(parts.map((part) => part.totalCents))).toBe(
          sum(
            input.invoices.map((item) =>
              invoiceOutstandingCents(item.totalCents, item.paidCents),
            ),
          ),
        );
        for (const part of parts) {
          expect(part.totalCents).toBeGreaterThan(0);
          expect(part.paidCents).toBe(0);
        }
        for (const id of byAccount.keys())
          expect(spendableIds.has(id)).toBe(true);
      }),
    );
  });

  it("(b) without a payer, an account pays no more than it scheduled", () => {
    fc.assert(
      fc.property(scenario(), (input) => {
        const spendableIds = new Set(input.accounts.map((item) => item.id));
        for (const item of input.invoices) {
          const { byAccount } = attributeInvoices({
            invoices: [item],
            payerByCard: new Map(),
            spendableIds,
          });
          for (const [id, parts] of byAccount) {
            const scheduled = sum(
              item.scheduled
                .filter((part) => part.fromAccountId === id)
                .map((part) => part.amountCents),
            );
            expect(
              sum(parts.map((part) => part.totalCents)),
            ).toBeLessThanOrEqual(scheduled);
          }
        }
      }),
    );
  });

  it("(c) with every part assigned, the accounts' lowest balances add up to no more than the total's", () => {
    fc.assert(
      fc.property(scenario({ assigned: true }), (input) => {
        const result = spendablePerDayByAccount(input);
        expect(result.unassignedCardIds).toEqual([]);
        const total = spendablePerDayByDay({
          days: totalFlow(input).days,
          today: input.today,
          until: input.until,
        });
        total.rows.forEach((row, k) => {
          const balances = result.accounts.map(
            (item) => item.rows[k]?.balanceCents ?? 0,
          );
          expect(sum(balances)).toBeLessThanOrEqual(row.balanceCents);
          if (balances.every((value) => value >= 0)) {
            expect(
              sum(
                result.accounts.map((item) => item.rows[k]?.perDayCents ?? 0),
              ),
            ).toBeLessThanOrEqual(row.perDayCents);
          }
        });
      }),
    );
  });

  it("(c) with nothing scheduled, the balances add up to the total's, and the days to it but rounding", () => {
    fc.assert(
      fc.property(scenario({ assigned: true, still: true }), (input) => {
        const result = spendablePerDayByAccount(input);
        const total = spendablePerDayByDay({
          days: totalFlow(input).days,
          today: input.today,
          until: input.until,
        });
        const n = input.accounts.length;
        const nonNegative = input.accounts.every(
          (item) => item.balanceCents >= 0,
        );
        total.rows.forEach((row, k) => {
          expect(
            sum(result.accounts.map((item) => item.rows[k]?.balanceCents ?? 0)),
          ).toBe(row.balanceCents);
          if (!nonNegative) return;
          const perDay = sum(
            result.accounts.map((item) => item.rows[k]?.perDayCents ?? 0),
          );
          expect(perDay).toBeLessThanOrEqual(row.perDayCents);
          expect(perDay).toBeGreaterThanOrEqual(row.perDayCents - (n - 1));
        });
      }),
    );
  });

  it("(d) with one account, the rows are the total's", () => {
    fc.assert(
      fc.property(scenario({ assigned: true }), (raw) => {
        const [only] = raw.accounts;
        if (!only) return;
        // Everything paid from it, scheduled or not.
        const input: Scenario = {
          ...raw,
          invoices: raw.invoices.map((item) => ({
            ...item,
            scheduled: item.scheduled.map((part) => ({
              ...part,
              fromAccountId: only.id,
            })),
          })),
          payerByCard: new Map(CARD_IDS.map((cardId) => [cardId, only.id])),
          accounts: [only],
          allPending: [...only.pending],
          allPaid: [...only.paidFromToday],
        };
        const result = spendablePerDayByAccount(input);
        const total = spendablePerDayByDay({
          days: totalFlow(input).days,
          today: input.today,
          until: input.until,
        });
        expect(result.accounts[0]?.rows).toEqual(total.rows);
        expect(result.accounts[0]?.shortfallCents).toBe(total.shortfallCents);
      }),
    );
  });

  it("(e) names a card exactly when part of an invoice due up to the end is unassigned", () => {
    fc.assert(
      fc.property(scenario(), (input) => {
        const spendableIds = new Set(input.accounts.map((item) => item.id));
        const { unassignedCardIds } = spendablePerDayByAccount(input);
        expect(new Set(unassignedCardIds).size).toBe(unassignedCardIds.length);
        for (const cardId of CARD_IDS) {
          const due = input.invoices.filter(
            (item) =>
              item.cardId === cardId && compare(item.dueDate, input.until) <= 0,
          );
          const { byAccount } = attributeInvoices({
            invoices: due,
            payerByCard: input.payerByCard,
            spendableIds,
          });
          const owed = sum(
            due.map((item) =>
              invoiceOutstandingCents(item.totalCents, item.paidCents),
            ),
          );
          const assigned = sum(
            partsOf(byAccount).map((part) => part.totalCents),
          );
          expect(unassignedCardIds.includes(cardId)).toBe(assigned < owed);
        }
      }),
    );
  });

  it("(f) with a chosen account, never falls back to the last payment", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ACCOUNT_IDS, BOX),
        fc.option(fc.constantFrom(...ACCOUNT_IDS, BOX)),
        fc.subarray(ACCOUNT_IDS),
        (configuredId, lastPaidFromId, spendable) => {
          const payer = invoicePayer({
            configuredId,
            lastPaidFromId,
            spendableIds: new Set(spendable),
          });
          expect(payer).toBe(
            spendable.includes(configuredId) ? configuredId : null,
          );
        },
      ),
    );
  });
});
