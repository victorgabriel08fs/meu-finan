// Maior gasto da semana (doc 02 §6.3): the biggest paid expenses of the last
// 7 days, against a real (in-memory) Postgres, on 14/out/2026.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  context: typeof import("./context");
  dashboard: typeof import("./dashboard");
  transactions: typeof import("./transactions");
};

let d: Domain;
let db: typeof import("../db/client").db;
let schema: typeof import("../db/schema");

// 14/out/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);
const ctxOf = (userId: string) =>
  d.context.getUserContext(userId, { now: NOW });

async function person(id: string) {
  await db
    .insert(schema.user)
    .values({ id, name: id, email: `${id}@exemplo.com` });
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  await ensureOwnerDefaults(id);
}

let seq = 0;
async function spend(
  id: string,
  accountId: string,
  amountCents: number,
  occurredOn: string,
  extra: Record<string, unknown> = {},
) {
  seq += 1;
  const ctx = await ctxOf(id);
  const created = await d.transactions.createTransaction(ctx, {
    kind: "expense",
    accountId,
    categoryId: null,
    amountCents,
    occurredOn,
    description: `Gasto ${seq}`,
    ...extra,
  });
  const [first] = created.ids;
  if (!first) throw new Error("sem lançamento");
  return first;
}

const biggest = async (id: string, limit?: number) =>
  d.dashboard.biggestExpenses(await ctxOf(id), limit);

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  schema = await import("../db/schema");
  d = {
    accounts: await import("./accounts"),
    context: await import("./context"),
    dashboard: await import("./dashboard"),
    transactions: await import("./transactions"),
  };
  for (const id of [
    "ana",
    "bia",
    "caio",
    "dora",
    "eva",
    "fabio",
    "gil",
    "hugo",
  ]) {
    await person(id);
  }
}, 120_000);

const checking = (id: string) =>
  d.accounts.createAccount(id, {
    name: "Conta",
    type: "checking",
    initialBalanceCents: 1_000_000,
  });

describe("topExpensesWindow", () => {
  it("counts 7 days, today included", () => {
    expect(d.dashboard.topExpensesWindow("2026-10-14")).toEqual({
      start: "2026-10-08",
      end: "2026-10-14",
    });
  });

  it("crosses the turn of the month and of the year", () => {
    expect(d.dashboard.topExpensesWindow("2026-11-03").start).toBe(
      "2026-10-28",
    );
    expect(d.dashboard.topExpensesWindow("2027-01-02").start).toBe(
      "2026-12-27",
    );
  });

  it("knows the leap day", () => {
    expect(d.dashboard.topExpensesWindow("2028-03-02").start).toBe(
      "2028-02-25",
    );
    expect(d.dashboard.topExpensesWindow("2027-03-02").start).toBe(
      "2027-02-24",
    );
  });
});

describe("biggestExpenses", () => {
  it("returns the 3 biggest, the most negative first", async () => {
    const acc = await checking("ana");
    await spend("ana", acc, 5_000, "2026-10-13");
    await spend("ana", acc, 90_000, "2026-10-12");
    await spend("ana", acc, 30_000, "2026-10-14");
    await spend("ana", acc, 70_000, "2026-10-10");
    const items = await biggest("ana");
    expect(items.map((item) => item.amountCents)).toEqual([
      -90_000, -70_000, -30_000,
    ]);
    expect(items[0]).toMatchObject({
      accountId: acc,
      accountName: "Conta",
      categoryName: null,
      installment: null,
      recurring: false,
    });
    expect(await biggest("ana", 1)).toHaveLength(1);
  });

  it("takes day -6 and today, not day -7 and not the future", async () => {
    const acc = await checking("bia");
    const out = await spend("bia", acc, 900_000, "2026-10-07");
    const first = await spend("bia", acc, 10_000, "2026-10-08");
    const today = await spend("bia", acc, 20_000, "2026-10-14");
    const ahead = await spend("bia", acc, 800_000, "2026-10-15");
    const ids = (await biggest("bia")).map((item) => item.id);
    expect(ids).toEqual([today, first]);
    expect(ids).not.toContain(out);
    expect(ids).not.toContain(ahead);
  });

  it("leaves out transfers, the invoice payment, adjustments, income, pending and deleted", async () => {
    const acc = await checking("caio");
    const other = await d.accounts.createAccount("caio", {
      name: "Reserva",
      type: "savings",
      initialBalanceCents: 0,
    });
    const card = await d.accounts.createAccount("caio", {
      name: "Cartão",
      type: "credit_card",
      initialBalanceCents: 0,
      card: { limitCents: 5_000_000, closingDay: 17, dueDay: 25 },
    });
    const ctx = await ctxOf("caio");
    await d.transactions.createTransfer(ctx, {
      fromAccountId: acc,
      toAccountId: other,
      amountCents: 500_000,
      occurredOn: "2026-10-13",
    });
    await d.transactions.createTransfer(ctx, {
      fromAccountId: acc,
      toAccountId: card,
      amountCents: 400_000,
      occurredOn: "2026-10-13",
      description: "Pagamento da fatura",
    });
    await d.accounts.adjustBalance(ctx, acc, 1_000_000 - 300_000);
    await d.transactions.createTransaction(ctx, {
      kind: "income",
      accountId: acc,
      categoryId: null,
      amountCents: 700_000,
      occurredOn: "2026-10-13",
      description: "Salário",
    });
    await spend("caio", acc, 600_000, "2026-10-13", { paid: false });
    const gone = await spend("caio", acc, 650_000, "2026-10-13");
    await d.transactions.deleteTransaction(ctx, gone);
    const kept = await spend("caio", acc, 1_000, "2026-10-13");
    const items = await biggest("caio");
    expect(items.map((item) => item.id)).toEqual([kept]);
  });

  it("counts card purchases, installments (the installment's value) and recurrences", async () => {
    const card = await d.accounts.createAccount("dora", {
      name: "Cartão",
      type: "credit_card",
      initialBalanceCents: 0,
      card: { limitCents: 5_000_000, closingDay: 17, dueDay: 25 },
    });
    const acc = await checking("dora");
    await spend("dora", card, 50_000, "2026-10-13");
    await spend("dora", card, 120_000, "2026-10-12", { installments: 3 });
    await spend("dora", acc, 80_000, "2026-10-11", {
      recurrence: { freq: "monthly" },
    });
    const items = await biggest("dora");
    expect(items.map((item) => item.amountCents)).toEqual([
      -80_000, -50_000, -40_000,
    ]);
    expect(items[0]?.recurring).toBe(true);
    expect(items[2]?.installment).toEqual({ number: 1, count: 3 });
  });

  it("breaks ties by the most recent day, then the latest created", async () => {
    const acc = await checking("eva");
    const older = await spend("eva", acc, 10_000, "2026-10-10");
    const newer = await spend("eva", acc, 10_000, "2026-10-12");
    const sameDay = await spend("eva", acc, 10_000, "2026-10-12");
    const ids = (await biggest("eva")).map((item) => item.id);
    expect(ids).toEqual([sameDay, newer, older]);
  });

  it("never reads another person's expenses", async () => {
    const mine = await checking("fabio");
    const theirs = await checking("gil");
    await spend("gil", theirs, 999_000, "2026-10-13");
    const own = await spend("fabio", mine, 1_000, "2026-10-13");
    expect((await biggest("fabio")).map((item) => item.id)).toEqual([own]);
    expect(await biggest("gil")).toHaveLength(1);
  });

  it("follows the person's today, not the server's", async () => {
    const acc = await checking("hugo");
    await spend("hugo", acc, 40_000, "2026-10-13");
    await spend("hugo", acc, 10_000, "2026-10-19", { paid: true });
    const ctx = await ctxOf("hugo");
    // Where it is already the 20th (far-east time zone): the 13th is out.
    const ahead = { ...ctx, todayIso: "2026-10-20" };
    const items = await d.dashboard.biggestExpenses(ahead);
    expect(items.map((item) => item.amountCents)).toEqual([-10_000]);
  });
});
