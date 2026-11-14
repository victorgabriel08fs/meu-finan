// Parcelas a terminar (doc 02 §6.3): the purchases in installments with
// something left to pay, against a real (in-memory) Postgres, on 14/out/2026.
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

const checking = (id: string) =>
  d.accounts.createAccount(id, {
    name: "Conta",
    type: "checking",
    initialBalanceCents: 1_000_000,
  });

/** A purchase in `installments` times; `paid` are the numbers marked paid. */
async function buy(
  id: string,
  accountId: string,
  description: string,
  amountCents: number,
  occurredOn: string,
  installments: number,
  paid: number[],
) {
  const ctx = await ctxOf(id);
  const { ids } = await d.transactions.createTransaction(ctx, {
    kind: "expense",
    accountId,
    categoryId: null,
    amountCents,
    occurredOn,
    description,
    installments,
  });
  for (const [index, txId] of ids.entries()) {
    await d.transactions.setTransactionPaid(
      ctx,
      txId,
      paid.includes(index + 1),
    );
  }
  return ids;
}

const ending = async (id: string, limit?: number) =>
  d.dashboard.installmentsEnding(await ctxOf(id), limit);

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
  for (const id of ["ana", "bia", "caio", "dora", "eva", "fabio", "gil"]) {
    await person(id);
  }
}, 120_000);

describe("installmentsEnding", () => {
  it("sums what is left of each purchase, the one that ends first leading", async () => {
    const acc = await checking("ana");
    // Tênis 6x of 100: the first two paid, four left, the last on 03/fev/2027.
    await buy("ana", acc, "Tênis", 60_000, "2026-09-03", 6, [1, 2]);
    // Sofá 3x of 100, all pending, ends on 20/dez/2026.
    await buy("ana", acc, "Sofá", 30_000, "2026-10-20", 3, []);
    const result = await ending("ana");
    expect(result.totalPlans).toBe(2);
    expect(result.items.map((item) => item.description)).toEqual([
      "Sofá",
      "Tênis",
    ]);
    expect(result.items[0]).toMatchObject({
      accountId: acc,
      remainingCents: 30_000,
      remainingCount: 3,
      nextNumber: 1,
      count: 3,
      nextOn: "2026-10-20",
      nextAmountCents: 10_000,
      endsOn: "2026-12-20",
    });
    expect(result.items[1]).toMatchObject({
      remainingCents: 40_000,
      remainingCount: 4,
      nextNumber: 3,
      count: 6,
      nextOn: "2026-11-03",
      nextAmountCents: 10_000,
      endsOn: "2027-02-03",
    });
    // The next installment of each purchase.
    expect(result.monthlyCents).toBe(20_000);
  });

  it("drops a purchase with every installment paid, and ignores what is not an installment", async () => {
    const acc = await checking("bia");
    await buy("bia", acc, "Fone", 20_000, "2026-08-10", 2, [1, 2]);
    const ctx = await ctxOf("bia");
    await d.transactions.createTransaction(ctx, {
      kind: "expense",
      accountId: acc,
      categoryId: null,
      amountCents: 5_000,
      occurredOn: "2026-10-20",
      description: "Avulso pendente",
    });
    await d.transactions.createTransaction(ctx, {
      kind: "income",
      accountId: acc,
      categoryId: null,
      amountCents: 90_000,
      occurredOn: "2026-10-20",
      description: "Freela futuro",
    });
    const other = await d.accounts.createAccount("bia", {
      name: "Reserva",
      type: "savings",
      initialBalanceCents: 100_000,
    });
    await d.transactions.createTransfer(ctx, {
      fromAccountId: acc,
      toAccountId: other,
      amountCents: 1_000,
      occurredOn: "2026-10-20",
      description: "Transferência futura",
    });
    expect(await ending("bia")).toEqual({
      items: [],
      totalPlans: 0,
      monthlyCents: 0,
    });
  });

  it("does not count deleted installments", async () => {
    const acc = await checking("caio");
    const ids = await buy(
      "caio",
      acc,
      "Geladeira",
      40_000,
      "2026-10-20",
      4,
      [],
    );
    const ctx = await ctxOf("caio");
    await d.transactions.deleteTransaction(ctx, ids[3] as string);
    const one = (await ending("caio")).items[0];
    expect(one).toMatchObject({
      remainingCents: 30_000,
      remainingCount: 3,
      endsOn: "2026-12-20",
    });
    // Deleting the first moves the next one forward.
    await d.transactions.deleteTransaction(ctx, ids[0] as string);
    expect((await ending("caio")).items[0]).toMatchObject({
      remainingCount: 2,
      nextNumber: 2,
      nextOn: "2026-11-20",
    });
    // Deleting the purchase ("todos") makes it vanish.
    await d.transactions.deleteTransaction(ctx, ids[1] as string, "all");
    expect((await ending("caio")).totalPlans).toBe(0);
  });

  it("counts an overdue pending installment", async () => {
    const acc = await checking("dora");
    await buy("dora", acc, "Cadeira", 30_000, "2026-09-03", 3, [1]);
    const result = await ending("dora");
    // 03/out is before today (14/out) and still pending.
    expect(result.items[0]).toMatchObject({
      remainingCount: 2,
      nextNumber: 2,
      nextOn: "2026-10-03",
      remainingCents: 20_000,
    });
  });

  it("cuts the list at the limit while the totals cover every purchase", async () => {
    const acc = await checking("eva");
    await buy("eva", acc, "A", 20_000, "2026-10-20", 2, []);
    await buy("eva", acc, "B", 30_000, "2026-10-20", 3, []);
    await buy("eva", acc, "C", 40_000, "2026-10-20", 4, []);
    await buy("eva", acc, "D", 50_000, "2026-10-20", 5, []);
    const result = await ending("eva");
    expect(result.items.map((item) => item.description)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(result.totalPlans).toBe(4);
    // 100 + 100 + 100 + 100, the four purchases.
    expect(result.monthlyCents).toBe(40_000);
    expect((await ending("eva", 1)).items).toHaveLength(1);
  });

  it("breaks a tie on the end date by the smaller remainder", async () => {
    const acc = await checking("fabio");
    // Both end on 20/dez/2026.
    await buy("fabio", acc, "Grande", 90_000, "2026-10-20", 3, []);
    await buy("fabio", acc, "Pequena", 6_000, "2026-10-20", 3, []);
    const result = await ending("fabio");
    expect(result.items.map((item) => item.description)).toEqual([
      "Pequena",
      "Grande",
    ]);
  });

  it("never reads another person's purchases", async () => {
    const acc = await checking("gil");
    await buy("gil", acc, "Do Gil", 20_000, "2026-10-20", 2, []);
    const mine = await ending("gil");
    expect(mine.items.map((item) => item.description)).toEqual(["Do Gil"]);
    // Ana's, Bia's... are not Gil's, and Gil's are not theirs.
    const ana = await ending("ana");
    expect(ana.items.map((item) => item.description)).not.toContain("Do Gil");
    const none = await ending("fabio");
    expect(none.items.map((item) => item.description)).not.toContain("Do Gil");
    await person("hugo");
    expect(await ending("hugo")).toEqual({
      items: [],
      totalPlans: 0,
      monthlyCents: 0,
    });
  });
});
