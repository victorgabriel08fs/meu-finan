// Assinaturas do mês (doc 02 §6.3): monthly expense recurrences read as
// subscriptions, against a real (in-memory) Postgres, on 14/out/2026.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  context: typeof import("./context");
  subscriptions: typeof import("./subscriptions");
  transactions: typeof import("./transactions");
};

let d: Domain;
let db: typeof import("../db/client").db;
let schema: typeof import("../db/schema");

// 14/out/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);
const ctxOf = (userId: string, monthStartDay = 1) =>
  d.context
    .getUserContext(userId, { now: NOW })
    .then((ctx) => ({ ...ctx, monthStartDay }));

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

async function repeat(
  id: string,
  accountId: string,
  description: string,
  amountCents: number,
  occurredOn: string,
  extra: {
    kind?: "expense" | "income";
    recurrence?: { freq: "weekly" | "monthly" | "yearly"; interval?: number };
  } = {},
) {
  const ctx = await ctxOf(id);
  const created = await d.transactions.createTransaction(ctx, {
    kind: extra.kind ?? "expense",
    accountId,
    categoryId: null,
    amountCents,
    occurredOn,
    description,
    recurrence: extra.recurrence ?? { freq: "monthly" },
  });
  return created.ids;
}

const subs = async (id: string, limit?: number, monthStartDay = 1) =>
  d.subscriptions.monthlySubscriptions(await ctxOf(id, monthStartDay), limit);

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  schema = await import("../db/schema");
  d = {
    accounts: await import("./accounts"),
    context: await import("./context"),
    subscriptions: await import("./subscriptions"),
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
    "iris",
    "joao",
    "kaue",
  ]) {
    await person(id);
  }
}, 120_000);

describe("monthlySubscriptions", () => {
  it("lists the monthly expenses with the next debit and the total", async () => {
    const acc = await checking("ana");
    await repeat("ana", acc, "Streaming", 4_490, "2026-07-10");
    await repeat("ana", acc, "Academia", 12_000, "2026-07-20");
    const s = await subs("ana");
    expect(s.totalCount).toBe(2);
    expect(s.monthlyCents).toBe(16_490);
    expect(s.items.map((i) => [i.description, i.nextOn])).toEqual([
      ["Academia", "2026-10-20"],
      ["Streaming", "2026-11-10"],
    ]);
    expect(s.items[0]).toMatchObject({
      accountId: acc,
      accountName: "Conta",
      amountCents: 12_000,
      increaseCents: 0,
    });
  });

  it("leaves out income, weekly, yearly and every-two-months rules", async () => {
    const acc = await checking("bia");
    await repeat("bia", acc, "Salário", 500_000, "2026-07-05", {
      kind: "income",
    });
    await repeat("bia", acc, "Feira", 5_000, "2026-09-01", {
      recurrence: { freq: "weekly" },
    });
    await repeat("bia", acc, "Domínio", 9_000, "2025-12-01", {
      recurrence: { freq: "yearly" },
    });
    await repeat("bia", acc, "Seguro", 20_000, "2026-08-05", {
      recurrence: { freq: "monthly", interval: 2 },
    });
    expect(await subs("bia")).toMatchObject({ totalCount: 0, items: [] });
    await repeat("bia", acc, "Internet", 9_990, "2026-07-12");
    expect((await subs("bia")).items.map((i) => i.description)).toEqual([
      "Internet",
    ]);
  });

  it("drops a stopped series: discarded whole, or ended with 'este e os próximos'", async () => {
    const acc = await checking("caio");
    const whole = await repeat("caio", acc, "Revista", 3_000, "2026-10-20");
    const ended = await repeat("caio", acc, "Clube", 7_000, "2026-07-18");
    await repeat("caio", acc, "Mantida", 1_000, "2026-07-18");
    expect((await subs("caio")).totalCount).toBe(3);

    const ctx = await ctxOf("caio");
    await d.transactions.discardCreated(ctx, { ids: whole });
    // The next pending occurrence (18/out) and the later ones go.
    const [, , , , nextClube] = ended;
    if (!nextClube) throw new Error("sem ocorrência");
    await d.transactions.deleteTransaction(
      ctx,
      ended[3] ?? nextClube,
      "future",
    );
    const s = await subs("caio");
    expect(s.items.map((i) => i.description)).toEqual(["Mantida"]);
  });

  it("leaves out an archived account's rules", async () => {
    const live = await checking("dora");
    const old = await d.accounts.createAccount("dora", {
      name: "Antiga",
      type: "checking",
      initialBalanceCents: 0,
    });
    await repeat("dora", live, "Viva", 1_000, "2026-07-12");
    await repeat("dora", old, "Velha", 2_000, "2026-07-12");
    expect((await subs("dora")).totalCount).toBe(2);
    await d.accounts.archiveAccount("dora", old);
    expect((await subs("dora")).items.map((i) => i.description)).toEqual([
      "Viva",
    ]);
  });

  it("never reads another person's rules", async () => {
    const acc = await checking("eva");
    const other = await checking("fabio");
    await repeat("eva", acc, "Streaming", 4_490, "2026-07-10");
    await repeat("fabio", other, "Streaming", 9_990, "2026-07-10");
    const mine = await subs("eva");
    expect(mine.totalCount).toBe(1);
    expect(mine.monthlyCents).toBe(4_490);
    expect(mine.items[0]?.accountId).toBe(acc);
    expect((await subs("gil")).totalCount).toBe(0);
  });

  it("skips a deleted next occurrence, and projects past the generated ones", async () => {
    const acc = await checking("gil");
    const ids = await repeat("gil", acc, "Streaming", 4_490, "2026-07-10");
    // Occurrences: 10/jul..10/out paid, 10/nov, 10/dez pending.
    const nextId = ids[4];
    if (!nextId) throw new Error("sem ocorrência");
    expect((await subs("gil")).items[0]?.nextOn).toBe("2026-11-10");
    await d.transactions.deleteTransaction(await ctxOf("gil"), nextId, "this");
    expect((await subs("gil")).items[0]?.nextOn).toBe("2026-12-10");
  });

  it("flags an increase made for 'este e os próximos', through the split rule", async () => {
    const acc = await checking("hugo");
    const ids = await repeat("hugo", acc, "Streaming", 4_490, "2026-07-10");
    const next = ids[4];
    if (!next) throw new Error("sem ocorrência");
    const ctx = await ctxOf("hugo");
    await d.transactions.updateTransaction(
      ctx,
      next,
      { amountCents: 4_990 },
      "future",
    );
    const s = await subs("hugo");
    expect(s.totalCount).toBe(1);
    expect(s.items[0]).toMatchObject({
      description: "Streaming",
      amountCents: 4_990,
      nextOn: "2026-11-10",
      previousCents: 4_490,
      previousOn: "2026-09-10",
      increaseCents: 500,
    });
    expect(s.increasedCount).toBe(1);
  });

  it("flags an increase made for 'todos' on the same rule, and no drop", async () => {
    const acc = await checking("iris");
    const up = await repeat("iris", acc, "Plano", 4_000, "2026-07-10");
    const down = await repeat("iris", acc, "Nuvem", 3_000, "2026-07-11");
    const ctx = await ctxOf("iris");
    // Only the pending entries follow a series edit: the past ones, paid, keep their value.
    await d.transactions.updateTransaction(
      ctx,
      up[4] as string,
      { amountCents: 4_700 },
      "all",
    );
    await d.transactions.updateTransaction(
      ctx,
      down[4] as string,
      { amountCents: 2_000 },
      "all",
    );
    const s = await subs("iris");
    const plan = s.items.find((i) => i.description === "Plano");
    const cloud = s.items.find((i) => i.description === "Nuvem");
    expect(plan).toMatchObject({ amountCents: 4_700, increaseCents: 700 });
    expect(cloud).toMatchObject({ amountCents: 2_000, increaseCents: 0 });
  });

  it("has no increase for a series that started this month", async () => {
    const acc = await checking("joao");
    await repeat("joao", acc, "Novo", 5_000, "2026-10-05");
    const [item] = (await subs("joao")).items;
    expect(item).toMatchObject({
      nextOn: "2026-11-05",
      previousCents: null,
      increaseCents: 0,
    });
  });

  it("measures the reference against the person's financial month", async () => {
    const acc = await checking("kaue");
    const ids = await repeat("kaue", acc, "Streaming", 4_490, "2026-07-10");
    // Month from the 10th: 10/out (paid, 4.490) already belongs to the
    // current month, so the reference is 10/set.
    const next = ids[4];
    if (!next) throw new Error("sem ocorrência");
    await d.transactions.updateTransaction(
      await ctxOf("kaue"),
      ids[3] as string,
      { amountCents: 4_990 },
      "this",
    );
    const day1 = await subs("kaue", undefined, 1);
    expect(day1.items[0]).toMatchObject({
      nextOn: "2026-11-10",
      previousOn: "2026-09-10",
    });
    const day10 = await subs("kaue", undefined, 10);
    expect(day10.items[0]).toMatchObject({ previousOn: "2026-09-10" });
    const day12 = await subs("kaue", undefined, 12);
    // From the 12th, 10/out is before the month: it is the reference.
    expect(day12.items[0]).toMatchObject({
      previousOn: "2026-10-10",
      previousCents: 4_990,
    });
  });

  it("cuts at the limit and counts the raised ones left out", async () => {
    await person("lia");
    const acc = await checking("lia");
    for (const [name, day] of [
      ["A", "10"],
      ["B", "11"],
      ["C", "12"],
    ] as const) {
      const ids = await repeat("lia", acc, name, 1_000, `2026-07-${day}`);
      if (name === "C") {
        await d.transactions.updateTransaction(
          await ctxOf("lia"),
          ids[4] as string,
          { amountCents: 1_500 },
          "future",
        );
      }
    }
    const s = await subs("lia", 2);
    expect(s.items).toHaveLength(2);
    expect(s).toMatchObject({
      totalCount: 3,
      monthlyCents: 3_500,
      increasedCount: 1,
      hiddenIncreasedCount: 1,
    });
  });
});
