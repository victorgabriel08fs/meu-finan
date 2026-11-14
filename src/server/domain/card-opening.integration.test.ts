// "Fatura atual" informed when a card is created (doc 03 §9.4) against a real
// (in-memory) Postgres: it is an entry on the current invoice, so the invoice
// total, the limit and the balance agree, and migration 0015 moves the same
// value off cards created before this.
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  cards: typeof import("./cards");
  context: typeof import("./context");
  reports: typeof import("./reports");
  transactions: typeof import("./transactions");
};

let d: Domain;
let db: typeof import("../db/client").db;
let schema: typeof import("../db/schema");
let fin: typeof import("@/lib/finance");

// 14/nov/2026, 12:00 in São Paulo. A card closing on the 1st and due on the
// 10th sends a purchase of this day to the December invoice.
const NOW = Date.UTC(2026, 10, 14, 15, 0, 0);
const CYCLE = { closingDay: 1, dueDay: 10 };

const ctxOf = (userId: string, now = NOW) =>
  d.context.getUserContext(userId, { now });

const newCard = (
  userId: string,
  initialBalanceCents: number,
  options: { now?: number } = { now: NOW },
  cycle = CYCLE,
) =>
  d.accounts.createAccount(
    userId,
    {
      name: "Cartão",
      type: "credit_card",
      initialBalanceCents,
      card: { limitCents: 500_000, ...cycle },
    },
    options,
  );

const entriesOf = (accountId: string) =>
  db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.accountId, accountId));

const expenseCategory = async (userId: string) => {
  const [row] = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.userId, userId),
        eq(schema.categories.kind, "expense"),
      ),
    )
    .limit(1);
  if (!row) throw new Error("no expense category");
  return row.id;
};

const initialOf = async (accountId: string) =>
  (
    await db
      .select({ cents: schema.finAccounts.initialBalanceCents })
      .from(schema.finAccounts)
      .where(eq(schema.finAccounts.id, accountId))
  )[0]?.cents;

const invoicesOf = (accountId: string) =>
  db
    .select()
    .from(schema.cardInvoices)
    .where(eq(schema.cardInvoices.accountId, accountId));

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  schema = await import("../db/schema");
  fin = await import("@/lib/finance");
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  await db.insert(schema.user).values([
    { id: "ana", name: "Ana", email: "ana@exemplo.com" },
    { id: "outro", name: "Outro", email: "outro@exemplo.com" },
    { id: "toquio", name: "Toquio", email: "toquio@exemplo.com" },
  ]);
  for (const id of ["ana", "outro", "toquio"]) await ensureOwnerDefaults(id);
  await db
    .update(schema.userSettings)
    .set({ timezone: "Asia/Tokyo" })
    .where(eq(schema.userSettings.userId, "toquio"));
  d = {
    accounts: await import("./accounts"),
    cards: await import("./cards"),
    context: await import("./context"),
    reports: await import("./reports"),
    transactions: await import("./transactions"),
  };
}, 60_000);

describe("valor inicial da fatura de um cartão novo", () => {
  let card: string;
  let checking: string;

  it("keeps the card at 0 and records the value as an entry on the current invoice", async () => {
    checking = await d.accounts.createAccount("ana", {
      name: "Conta",
      type: "checking",
      initialBalanceCents: 1_000_000,
    });
    card = await newCard("ana", 123_456);
    expect(await initialOf(card)).toBe(0);
    const entries = await entriesOf(card);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "adjustment",
      status: "paid",
      amountCents: -123_456,
      description: "Valor inicial da fatura",
      occurredOn: "2026-11-14",
    });
    const invoices = await d.cards.listInvoices(await ctxOf("ana"), card);
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      id: entries[0]?.invoiceId,
      referenceMonth: "2026-12",
      totalCents: 123_456,
      outstandingCents: 123_456,
      status: "open",
    });
  });

  it("agrees across the invoice, the limit and the balance", async () => {
    const overview = await d.cards.getCardOverview(await ctxOf("ana"), card);
    expect(overview.usedCents).toBe(123_456);
    expect(overview.availableCents).toBe(500_000 - 123_456);
    expect(overview.currentReferenceMonth).toBe("2026-12");
    const account = (await d.accounts.listAccounts("ana")).find(
      (item) => item.id === card,
    );
    expect(account?.balanceCents).toBe(-123_456);
  });

  it("leaves the instalments of later months on their own invoices", async () => {
    const ctx = await ctxOf("ana");
    await d.transactions.createTransaction(ctx, {
      kind: "expense",
      amountCents: 30_000,
      accountId: card,
      categoryId: await expenseCategory("ana"),
      description: "Geladeira",
      occurredOn: "2027-01-05",
      installments: 3,
    });
    const byMonth = new Map(
      (await d.cards.listInvoices(ctx, card)).map((item) => [
        item.referenceMonth,
        item.totalCents,
      ]),
    );
    expect(byMonth.get("2026-12")).toBe(123_456);
    expect(byMonth.get("2027-02")).toBe(10_000);
    expect(byMonth.get("2027-03")).toBe(10_000);
    expect(byMonth.get("2027-04")).toBe(10_000);
  });

  it("is not an expense and does not change the net worth", async () => {
    const ctx = await ctxOf("ana");
    const totals = await d.transactions.periodTotals(
      ctx,
      "2026-11-01",
      "2026-11-30",
    );
    expect(Math.abs(totals.expenseCents)).toBe(0);
    expect(Math.abs(totals.pendingExpenseCents)).toBe(0);
    const accounts = await d.accounts.listAccounts("ana");
    const net = accounts
      .filter((item) => item.includeInNetWorth)
      .reduce((sum, item) => sum + item.balanceCents, 0);
    expect(net).toBe(1_000_000 - 123_456);
  });

  it("paying the whole invoice clears it and brings the card back to 0", async () => {
    const ctx = await ctxOf("ana");
    const [invoice] = await d.cards.listInvoices(ctx, card);
    if (!invoice) throw new Error("no invoice");
    await d.cards.payInvoice(ctx, {
      invoiceId: invoice.id,
      fromAccountId: checking,
      amountCents: 123_456,
      occurredOn: "2026-11-14",
    });
    const [paid] = await d.cards.listInvoices(ctx, card);
    expect(paid).toMatchObject({
      paidCents: 123_456,
      outstandingCents: 0,
    });
    const account = (await d.accounts.listAccounts("ana")).find(
      (item) => item.id === card,
    );
    expect(account?.balanceCents).toBe(0);
  });

  it("creates no entry and no invoice for a card without a value", async () => {
    const empty = await newCard("ana", 0);
    expect(await entriesOf(empty)).toHaveLength(0);
    expect(await invoicesOf(empty)).toHaveLength(0);
  });

  it("does not show the invoices to another person", async () => {
    expect(await d.cards.listInvoices(await ctxOf("outro"), card)).toEqual([]);
  });

  it("dates it by the person's time zone", async () => {
    // 14/nov 20:00 UTC is already 15/nov in Tokyo.
    const now = Date.UTC(2026, 10, 14, 20, 0, 0);
    const tokyo = await newCard("toquio", 10_000, { now });
    const [entry] = await entriesOf(tokyo);
    expect(entry?.occurredOn).toBe("2026-11-15");
    const dates = fin.invoiceFor(fin.parse("2026-11-15"), CYCLE);
    const [invoice] = await invoicesOf(tokyo);
    expect(invoice?.referenceMonth.slice(0, 7)).toBe(
      fin.isoMonth(dates.referenceMonth),
    );
  });

  it("Ajustar saldo on a card goes to the current invoice", async () => {
    const adjusted = await newCard("ana", 0);
    const ctx = await ctxOf("ana");
    const difference = await d.accounts.adjustBalance(ctx, adjusted, 40_000);
    expect(difference).toBe(-40_000);
    const [entry] = await entriesOf(adjusted);
    expect(entry).toMatchObject({
      kind: "adjustment",
      amountCents: -40_000,
      description: "Ajuste de saldo",
    });
    const [invoice] = await d.cards.listInvoices(ctx, adjusted);
    expect(invoice).toMatchObject({
      id: entry?.invoiceId,
      referenceMonth: "2026-12",
      totalCents: 40_000,
    });
  });

  it("Ajustar saldo on a regular account has no invoice", async () => {
    await d.accounts.adjustBalance(await ctxOf("ana"), checking, 900_000);
    const adjustment = (await entriesOf(checking)).find(
      (item) => item.description === "Ajuste de saldo",
    );
    expect(adjustment?.invoiceId).toBeNull();
  });
});

describe("migração 0015: saldo inicial dos cartões existentes", () => {
  const migration = readFileSync(
    "drizzle/0015_card_opening_invoice.sql",
    "utf8",
  );
  const runMigration = async () => {
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.execute(sql.raw(statement));
    }
  };

  /** A card as it was stored before: owed value in initial_balance_cents. */
  async function legacyCard(
    userId: string,
    cents: number,
    cycle: { closingDay: number; dueDay: number },
    createdAt: Date,
  ) {
    const id = await newCard(userId, 0, { now: NOW }, cycle);
    await db
      .update(schema.finAccounts)
      .set({ initialBalanceCents: cents, createdAt })
      .where(eq(schema.finAccounts.id, id));
    return id;
  }

  // [closing, due, created on (São Paulo noon)]
  const cases: [number, number, string][] = [
    [1, 10, "2026-11-14"],
    [25, 5, "2026-11-14"],
    [25, 5, "2026-12-30"],
    [31, 15, "2026-11-20"],
    [31, 15, "2026-11-30"],
    [1, 10, "2026-11-01"],
    [10, 10, "2026-02-10"],
  ];

  it.each(
    cases,
  )("closing %i, due %i, created on %s", async (closingDay, dueDay, day) => {
    const cycle = { closingDay, dueDay };
    const [y, m, dd] = day.split("-").map(Number) as [number, number, number];
    const card = await legacyCard(
      "ana",
      -50_000,
      cycle,
      new Date(Date.UTC(y, m - 1, dd, 15, 0, 0)),
    );
    await runMigration();
    const expected = fin.invoiceFor(fin.parse(day), cycle);
    const [entry] = await entriesOf(card);
    expect(entry).toMatchObject({
      kind: "adjustment",
      status: "paid",
      amountCents: -50_000,
      description: "Valor inicial da fatura",
      occurredOn: day,
    });
    const [invoice] = await invoicesOf(card);
    expect(invoice).toMatchObject({
      id: entry?.invoiceId,
      closingDate: fin.iso(expected.closingDate),
      dueDate: fin.iso(expected.dueDate),
    });
    expect(invoice?.referenceMonth).toBe(
      `${fin.isoMonth(expected.referenceMonth)}-01`,
    );
    expect(await initialOf(card)).toBe(0);
  });

  it("does not run twice over the same card", async () => {
    const card = await legacyCard(
      "ana",
      -7_000,
      CYCLE,
      new Date(Date.UTC(2026, 9, 3, 15)),
    );
    await runMigration();
    await runMigration();
    expect(await entriesOf(card)).toHaveLength(1);
    expect(await invoicesOf(card)).toHaveLength(1);
  });

  it("reuses an invoice that already exists for the month", async () => {
    const card = await legacyCard(
      "ana",
      -9_000,
      CYCLE,
      new Date(Date.UTC(2026, 10, 14, 15)),
    );
    const existing = await d.transactions.createTransaction(
      await ctxOf("ana"),
      {
        kind: "expense",
        amountCents: 1_000,
        accountId: card,
        categoryId: await expenseCategory("ana"),
        description: "Compra",
        occurredOn: "2026-11-14",
      },
    );
    const [before] = await invoicesOf(card);
    expect(existing.ids).toHaveLength(1);
    await runMigration();
    const invoices = await invoicesOf(card);
    expect(invoices).toHaveLength(1);
    const entries = await entriesOf(card);
    expect(entries).toHaveLength(2);
    expect(entries.every((item) => item.invoiceId === before?.id)).toBe(true);
  });

  it("leaves a card at 0 and a checking account with a balance alone", async () => {
    const zero = await newCard("ana", 0);
    const checking = await d.accounts.createAccount("ana", {
      name: "Conta antiga",
      type: "checking",
      initialBalanceCents: 77_000,
    });
    await runMigration();
    expect(await entriesOf(zero)).toHaveLength(0);
    expect(await initialOf(checking)).toBe(77_000);
    expect(
      await db
        .select()
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.accountId, checking),
            eq(schema.transactions.description, "Valor inicial da fatura"),
          ),
        ),
    ).toHaveLength(0);
  });
});
