// Fechamento do mês (doc 02 §6.12, doc 03 §12): how a finished financial month
// went, against a real (in-memory) Postgres, on 14/nov/2026 (the last closed
// month is outubro).
import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  budgets: typeof import("./budgets");
  categories: typeof import("./categories");
  closing: typeof import("./month-closing");
  context: typeof import("./context");
  groups: typeof import("./sharing/groups");
  expenses: typeof import("./sharing/expenses");
  transactions: typeof import("./transactions");
};

let d: Domain;
let db: typeof import("../db/client").db;
let schema: typeof import("../db/schema");

// 14/nov/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 10, 14, 15, 0, 0);
const ctxOf = async (userId: string, monthStartDay?: number) => {
  const base = await d.context.getUserContext(userId, { now: NOW });
  return monthStartDay ? { ...base, monthStartDay } : base;
};

async function person(id: string) {
  await db
    .insert(schema.user)
    .values({ id, name: id, email: `${id}@exemplo.com` });
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  await ensureOwnerDefaults(id);
}

const account = (
  id: string,
  type: "checking" | "savings_box" | "benefit" = "checking",
  name = "Conta",
) =>
  d.accounts.createAccount(id, {
    name,
    type,
    initialBalanceCents: 10_000_000,
  });

const category = (id: string, name: string, parentId: string | null = null) =>
  d.categories.createCategory(id, {
    kind: "expense",
    name,
    icon: "house",
    color: "cat-1",
    parentId,
  });

async function entry(
  id: string,
  accountId: string,
  kind: "expense" | "income",
  amountCents: number,
  occurredOn: string,
  extra: Record<string, unknown> = {},
) {
  const ctx = await ctxOf(id);
  const created = await d.transactions.createTransaction(ctx, {
    kind,
    accountId,
    categoryId: null,
    amountCents,
    occurredOn,
    description: "Lançamento",
    paid: true,
    ...extra,
  });
  const [first] = created.ids;
  if (!first) throw new Error("sem lançamento");
  return first;
}

const spend = (
  id: string,
  accountId: string,
  amountCents: number,
  occurredOn: string,
  extra: Record<string, unknown> = {},
) => entry(id, accountId, "expense", amountCents, occurredOn, extra);

const budget = async (
  id: string,
  categoryId: string,
  month: string,
  amountCents: number,
) =>
  d.budgets.upsertBudget(await ctxOf(id), { categoryId, month, amountCents });

async function transfer(
  id: string,
  from: string,
  to: string,
  amountCents: number,
  occurredOn: string,
  paid?: boolean,
) {
  const ctx = await ctxOf(id);
  return d.transactions.createTransfer(ctx, {
    fromAccountId: from,
    toAccountId: to,
    amountCents,
    occurredOn,
    paid,
  });
}

async function closing(id: string, month: string | null = null, day?: number) {
  const ctx = await ctxOf(id, day);
  const { range } = d.closing.closingRange(ctx, month);
  return d.closing.monthClosing(ctx, range);
}

const PEOPLE = [
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
  "kemi",
  "lia",
  "mia",
  "noa",
  "eva2",
];

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  schema = await import("../db/schema");
  d = {
    accounts: await import("./accounts"),
    budgets: await import("./budgets"),
    categories: await import("./categories"),
    closing: await import("./month-closing"),
    context: await import("./context"),
    groups: await import("./sharing/groups"),
    expenses: await import("./sharing/expenses"),
    transactions: await import("./transactions"),
  };
  for (const id of PEOPLE) await person(id);
}, 120_000);

describe("closingRange", () => {
  it("sends a missing, malformed, current or future month to the last closed one", async () => {
    const ctx = await ctxOf("ana");
    for (const month of [null, "2026-11", "2026-12", "2027-03", "abc"]) {
      const result = d.closing.closingRange(ctx, month);
      expect(result.range.month).toBe("2026-10");
      expect(result.lastClosed.month).toBe("2026-10");
      expect(result.current.month).toBe("2026-11");
    }
  });

  it("keeps an earlier month", async () => {
    const ctx = await ctxOf("ana");
    expect(d.closing.closingRange(ctx, "2026-08").range.month).toBe("2026-08");
    expect(d.closing.closingRange(ctx, "2026-10").range.month).toBe("2026-10");
  });

  it("follows a financial month that starts on the 5th", async () => {
    const ctx = await ctxOf("ana", 5);
    const result = d.closing.closingRange(ctx, null);
    expect(result.current).toMatchObject({
      month: "2026-11",
      start: "2026-11-05",
    });
    expect(result.range).toMatchObject({
      month: "2026-10",
      start: "2026-10-05",
      end: "2026-11-04",
    });
  });

  it("has no closing for a period that has not ended", async () => {
    const ctx = await ctxOf("ana");
    const running = d.context.resolvePeriod(ctx, "2026-11");
    expect(await d.closing.monthClosing(ctx, running)).toBeNull();
  });
});

describe("monthClosing totals", () => {
  it("counts paid income and expenses only, as the Resumo mensal does", async () => {
    const acc = await account("ana");
    const reserve = await account("ana", "savings_box", "Reserva");
    const card = await d.accounts.createAccount("ana", {
      name: "Cartão",
      type: "credit_card",
      initialBalanceCents: 0,
      card: { limitCents: 5_000_000, closingDay: 17, dueDay: 25 },
    });
    await entry("ana", acc, "income", 800_000, "2026-10-05");
    await spend("ana", acc, 300_000, "2026-10-10");
    // Out: pending, transfers, invoice payment, adjustment, deleted, other months.
    await spend("ana", acc, 50_000, "2026-10-12", { paid: false });
    const gone = await spend("ana", acc, 70_000, "2026-10-13");
    await d.transactions.deleteTransaction(await ctxOf("ana"), gone);
    await transfer("ana", acc, reserve, 100_000, "2026-10-20");
    await d.transactions.createTransfer(await ctxOf("ana"), {
      fromAccountId: acc,
      toAccountId: card,
      amountCents: 40_000,
      occurredOn: "2026-10-21",
      description: "Pagamento da fatura",
    });
    await d.accounts.adjustBalance(await ctxOf("ana"), acc, 9_000_000);
    await spend("ana", acc, 999_000, "2026-09-30");
    await spend("ana", acc, 888_000, "2026-11-02");
    const result = await closing("ana");
    expect(result).toMatchObject({
      month: "2026-10",
      previousMonth: "2026-09",
      currentMonth: "2026-11",
      start: "2026-10-01",
      end: "2026-10-31",
      latest: true,
      incomeCents: 800_000,
      expenseCents: 300_000,
      leftCents: 500_000,
      hasPending: true,
    });
  });

  it("has no pending note when nothing is pending", async () => {
    const acc = await account("joao");
    await spend("joao", acc, 10_000, "2026-10-10");
    expect((await closing("joao"))?.hasPending).toBe(false);
  });

  it("goes negative when the expenses passed the income", async () => {
    const acc = await account("bia");
    await entry("bia", acc, "income", 100_000, "2026-10-05");
    await spend("bia", acc, 250_000, "2026-10-06");
    const result = await closing("bia");
    expect(result).toMatchObject({
      incomeCents: 100_000,
      expenseCents: 250_000,
      leftCents: -150_000,
    });
  });

  it("gives the leftover of the month before, or null when it had nothing paid", async () => {
    const acc = await account("caio");
    await entry("caio", acc, "income", 100_000, "2026-09-05");
    await spend("caio", acc, 40_000, "2026-09-10");
    await spend("caio", acc, 10_000, "2026-10-10");
    expect((await closing("caio"))?.previous).toEqual({ leftCents: 60_000 });
    // September's own month before (August) had nothing.
    expect((await closing("caio", "2026-09"))?.previous).toBeNull();
  });

  it("follows a month that starts on the 5th", async () => {
    const acc = await account("dora");
    await spend("dora", acc, 1_000, "2026-10-04");
    await spend("dora", acc, 2_000, "2026-10-05");
    await spend("dora", acc, 4_000, "2026-11-04");
    await spend("dora", acc, 8_000, "2026-11-05");
    const result = await closing("dora", null, 5);
    expect(result).toMatchObject({
      month: "2026-10",
      start: "2026-10-05",
      end: "2026-11-04",
      expenseCents: 6_000,
    });
  });
});

describe("monthClosing budgets", () => {
  async function setup(who: string) {
    const acc = await account(who);
    const lazer = await category(who, `Cinema ${who}`);
    const feira = await category(who, `Hortifruti ${who}`);
    const mercado = await category(who, `Atacado ${who}`);
    const padaria = await category(who, `Pães ${who}`, mercado);
    await budget(who, lazer, "2026-10", 50_000);
    await budget(who, feira, "2026-10", 20_000);
    await budget(who, mercado, "2026-10", 10_000);
    await spend(who, acc, 10_000, "2026-10-03", { categoryId: lazer });
    // Feira: over by 10.000; averages over ago–out: (1.000 + 1.002 + 30.000) / 3.
    await spend(who, acc, 1_000, "2026-08-10", { categoryId: feira });
    await spend(who, acc, 1_002, "2026-09-10", { categoryId: feira });
    await spend(who, acc, 30_000, "2026-10-10", { categoryId: feira });
    // Mercado: only its subcategory spent, over by 15.000.
    await spend(who, acc, 25_000, "2026-10-11", { categoryId: padaria });
    return { feira, mercado, lazer };
  }

  it("counts the kept ones, lists the over ones by excess and sums a subcategory into its parent", async () => {
    const { feira, mercado } = await setup("eva");
    const result = await closing("eva");
    expect(result?.budgets?.metCount).toBe(1);
    expect(
      result?.budgets?.over.map((item) => [
        item.categoryId,
        item.spentCents,
        item.budgetCents,
      ]),
    ).toEqual([
      [mercado, 25_000, 10_000],
      [feira, 30_000, 20_000],
    ]);
  });

  it("gives the 3-month average and the current budget in the last closed month", async () => {
    const { feira, mercado } = await setup("eva2");
    await budget("eva2", feira, "2026-11", 5_000);
    const result = await closing("eva2");
    const over = result?.budgets?.over ?? [];
    const of = (id: string) => over.find((item) => item.categoryId === id);
    expect(of(feira)).toMatchObject({
      averageCents: Math.round(32_002 / 3),
      nextBudgetCents: 5_000,
    });
    expect(of(mercado)).toMatchObject({
      averageCents: Math.round(25_000 / 3),
      nextBudgetCents: null,
    });
  });

  it("has no suggestions, caixinha or what comes next in an earlier month", async () => {
    const acc = await account("fabio");
    const feira = await category("fabio", "Hortifruti");
    await budget("fabio", feira, "2026-09", 1_000);
    await budget("fabio", feira, "2026-11", 9_000);
    await spend("fabio", acc, 5_000, "2026-09-10", { categoryId: feira });
    const result = await closing("fabio", "2026-09");
    expect(result).toMatchObject({ latest: false, next: null });
    expect(result?.budgets?.over).toEqual([
      expect.objectContaining({
        categoryId: feira,
        averageCents: null,
        nextBudgetCents: null,
      }),
    ]);
  });

  it("is null when the month had no budgets", async () => {
    const acc = await account("gil");
    await spend("gil", acc, 5_000, "2026-10-10");
    expect((await closing("gil"))?.budgets).toBeNull();
  });
});

describe("monthClosing caixinhas", () => {
  it("counts what went into the person's caixinhas from the month's start until today", async () => {
    const acc = await account("iris");
    const reserve = await account("iris", "savings_box", "Reserva");
    const trip = await account("iris", "savings_box", "Viagem");
    const old = await account("iris", "savings_box", "Velha");
    await entry("iris", acc, "income", 500_000, "2026-10-05");
    // In: October and November until today, in an archived caixinha too.
    await transfer("iris", acc, reserve, 100_000, "2026-10-20");
    await transfer("iris", acc, reserve, 20_000, "2026-11-05");
    await transfer("iris", acc, old, 3_000, "2026-11-02");
    await d.accounts.archiveAccount("iris", old);
    // A withdrawal subtracts; between caixinhas it cancels.
    await transfer("iris", reserve, acc, 5_000, "2026-11-06");
    await transfer("iris", reserve, trip, 30_000, "2026-11-07");
    // Out: pending, deleted, before the month, in the future.
    await transfer("iris", acc, reserve, 77_000, "2026-11-08", false);
    const { transferId } = await transfer(
      "iris",
      acc,
      reserve,
      66_000,
      "2026-11-09",
    );
    const [leg] = await db
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(eq(schema.transactions.transferId, transferId));
    if (!leg) throw new Error("sem perna");
    await d.transactions.deleteTransaction(await ctxOf("iris"), leg.id);
    await transfer("iris", acc, reserve, 9_000, "2026-09-30");
    await transfer("iris", acc, reserve, 40_000, "2026-11-20");
    const result = await closing("iris");
    expect(result?.next?.savings.savedCents).toBe(
      100_000 + 20_000 + 3_000 - 5_000,
    );
  });

  it("offers only the person's active caixinhas, and never a benefit or a caixinha as the account to spend from", async () => {
    await account("kemi", "benefit", "VR");
    const reserve = await account("kemi", "savings_box", "Reserva");
    const old = await account("kemi", "savings_box", "Velha");
    await d.accounts.archiveAccount("kemi", old);
    const checking = await account("kemi", "checking", "Conta");
    const archivedChecking = await account("kemi", "checking", "Antiga");
    await d.accounts.archiveAccount("kemi", archivedChecking);
    // Someone else's caixinha never shows up.
    await account("ana", "savings_box", "Outra");
    const result = await closing("kemi");
    expect(result?.next?.savings.boxes).toEqual([
      { id: reserve, name: "Reserva" },
    ]);
    expect(result?.next?.savings.spendableId).toBe(checking);
  });

  it("has no account to spend from without one", async () => {
    await account("lia", "savings_box", "Reserva");
    expect((await closing("lia"))?.next?.savings.spendableId).toBeNull();
  });
});

describe("monthClosing isolation", () => {
  it("never reads another person's rows, budgets or caixinhas", async () => {
    const mine = await account("mia");
    const theirs = await account("fabio", "checking", "Outra conta");
    const theirBox = await account("fabio", "savings_box", "Cofre");
    const theirFeira = await category("fabio", "Brinquedos");
    await budget("fabio", theirFeira, "2026-10", 1_000);
    await entry("fabio", theirs, "income", 9_000_000, "2026-10-05");
    await spend("fabio", theirs, 999_000, "2026-10-10", {
      categoryId: theirFeira,
    });
    await transfer("fabio", theirs, theirBox, 500_000, "2026-10-20");
    await spend("mia", mine, 1_000, "2026-10-10");
    const result = await closing("mia");
    expect(result).toMatchObject({
      incomeCents: 0,
      expenseCents: 1_000,
      budgets: null,
      next: { savings: { boxes: [], savedCents: 0 } },
    });
  });

  it("counts an expense put in a group in full, for who entered it only", async () => {
    const acc = await account("noa");
    const own = await spend("noa", acc, 60_000, "2026-10-08");
    const ctx = await ctxOf("noa");
    const groupId = uuidv7();
    await d.groups.createGroup(
      ctx,
      { id: groupId, name: "Casa", emails: [] },
      { now: new Date(NOW) },
    );
    const [member] = await db
      .select({ id: schema.shareMembers.id })
      .from(schema.shareMembers)
      .where(
        and(
          eq(schema.shareMembers.groupId, groupId),
          eq(schema.shareMembers.userId, "noa"),
        ),
      );
    if (!member) throw new Error("sem membro");
    await d.expenses.addSharedExpenses(ctx, groupId, [
      {
        id: uuidv7(),
        description: "",
        amountCents: 1,
        occurredOn: "2026-10-08",
        paidByMemberId: member.id,
        transactionId: own,
        method: "equal",
        inputs: [{ memberId: member.id, value: 1 }],
      },
    ]);
    expect((await closing("noa"))?.expenseCents).toBe(60_000);
  });
});
