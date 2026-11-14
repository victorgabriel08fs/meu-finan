// Comparado ao mês passado (doc 02 §6.3, doc 03 §12): paid expenses up to the
// same point of the month before, against a real (in-memory) Postgres, on
// 14/nov/2026.
import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  categories: typeof import("./categories");
  comparison: typeof import("./month-comparison");
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
const ctxOf = (userId: string, now = NOW) =>
  d.context.getUserContext(userId, { now });

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

async function spend(
  id: string,
  accountId: string,
  amountCents: number,
  occurredOn: string,
  extra: Record<string, unknown> = {},
) {
  const ctx = await ctxOf(id);
  const created = await d.transactions.createTransaction(ctx, {
    kind: "expense",
    accountId,
    categoryId: null,
    amountCents,
    occurredOn,
    description: "Gasto",
    paid: true,
    ...extra,
  });
  const [first] = created.ids;
  if (!first) throw new Error("sem lançamento");
  return first;
}

async function compare(
  id: string,
  month?: string,
  options: { now?: number; monthStartDay?: number } = {},
) {
  const base = await ctxOf(id, options.now);
  const ctx = options.monthStartDay
    ? { ...base, monthStartDay: options.monthStartDay }
    : base;
  return d.comparison.monthComparison(ctx, d.context.resolvePeriod(ctx, month));
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
  "lara",
  "mel",
];

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  schema = await import("../db/schema");
  d = {
    accounts: await import("./accounts"),
    categories: await import("./categories"),
    comparison: await import("./month-comparison"),
    context: await import("./context"),
    groups: await import("./sharing/groups"),
    expenses: await import("./sharing/expenses"),
    transactions: await import("./transactions"),
  };
  for (const id of PEOPLE) await person(id);
}, 120_000);

describe("monthComparison", () => {
  it("compares 1-14/nov with 1-14/out and leaves 15-31/out out", async () => {
    const acc = await checking("ana");
    const food = await category("ana", "Feira");
    const home = await category("ana", "Reforma");
    await spend("ana", acc, 30_000, "2026-11-05", { categoryId: food });
    await spend("ana", acc, 20_000, "2026-11-14", { categoryId: home });
    await spend("ana", acc, 90_000, "2026-11-15", { categoryId: home });
    await spend("ana", acc, 10_000, "2026-10-01", { categoryId: food });
    await spend("ana", acc, 20_000, "2026-10-14", { categoryId: home });
    await spend("ana", acc, 500_000, "2026-10-15", { categoryId: home });
    await spend("ana", acc, 500_000, "2026-09-30", { categoryId: home });
    const result = await compare("ana");
    expect(result).toMatchObject({
      month: "2026-11",
      previousMonth: "2026-10",
      current: { start: "2026-11-01", end: "2026-11-14" },
      previous: { start: "2026-10-01", end: "2026-10-14" },
      complete: false,
    });
    expect(result?.total).toMatchObject({
      currentCents: 50_000,
      baselineCents: 30_000,
      diffCents: 20_000,
      direction: "up",
    });
    expect(result?.total.ratio).toBeCloseTo(2 / 3);
    expect(result?.categories.map((c) => [c.name, c.diffCents])).toEqual([
      ["Feira", 20_000],
    ]);
  });

  it("adds a subcategory into its parent", async () => {
    const acc = await checking("bia");
    const food = await category("bia", "Alimentação");
    const sub = await category("bia", "Padaria", food);
    await spend("bia", acc, 5_000, "2026-11-02", { categoryId: food });
    await spend("bia", acc, 7_000, "2026-11-03", { categoryId: sub });
    await spend("bia", acc, 2_000, "2026-10-03", { categoryId: sub });
    const result = await compare("bia");
    expect(result?.categories).toHaveLength(1);
    expect(result?.categories[0]).toMatchObject({
      categoryId: food,
      name: "Alimentação",
      currentCents: 12_000,
      baselineCents: 2_000,
      diffCents: 10_000,
    });
  });

  it("keeps the uncategorised in a bucket of its own", async () => {
    const acc = await checking("caio");
    await spend("caio", acc, 40_000, "2026-11-02");
    const result = await compare("caio");
    expect(result?.categories).toHaveLength(1);
    expect(result?.categories[0]).toMatchObject({
      categoryId: null,
      name: "Sem categoria",
      icon: "ellipsis",
      color: "neutral",
      currentCents: 40_000,
      ratio: null,
    });
  });

  it("leaves out transfers, the invoice payment, caixinha-like moves, adjustments, income, pending and deleted", async () => {
    const acc = await checking("dora");
    const other = await d.accounts.createAccount("dora", {
      name: "Reserva",
      type: "savings",
      initialBalanceCents: 0,
    });
    const card = await d.accounts.createAccount("dora", {
      name: "Cartão",
      type: "credit_card",
      initialBalanceCents: 0,
      card: { limitCents: 5_000_000, closingDay: 17, dueDay: 25 },
    });
    const ctx = await ctxOf("dora");
    await d.transactions.createTransfer(ctx, {
      fromAccountId: acc,
      toAccountId: other,
      amountCents: 500_000,
      occurredOn: "2026-11-10",
    });
    await d.transactions.createTransfer(ctx, {
      fromAccountId: acc,
      toAccountId: card,
      amountCents: 400_000,
      occurredOn: "2026-11-10",
      description: "Pagamento da fatura",
    });
    await d.accounts.adjustBalance(ctx, acc, 9_000_000);
    await d.transactions.createTransaction(ctx, {
      kind: "income",
      accountId: acc,
      categoryId: null,
      amountCents: 700_000,
      occurredOn: "2026-11-10",
      description: "Salário",
    });
    await spend("dora", acc, 600_000, "2026-11-10", { paid: false });
    const gone = await spend("dora", acc, 650_000, "2026-11-10");
    await d.transactions.deleteTransaction(ctx, gone);
    await spend("dora", acc, 1_500, "2026-11-10");
    const result = await compare("dora");
    expect(result?.total.currentCents).toBe(1_500);
    expect(result?.total.baselineCents).toBe(0);
  });

  it("counts card purchases on their date, installments by value and recurrences", async () => {
    const card = await d.accounts.createAccount("eva", {
      name: "Cartão",
      type: "credit_card",
      initialBalanceCents: 0,
      card: { limitCents: 5_000_000, closingDay: 17, dueDay: 25 },
    });
    const acc = await checking("eva");
    await spend("eva", card, 50_000, "2026-11-13");
    await spend("eva", card, 120_000, "2026-11-12", { installments: 3 });
    await spend("eva", acc, 80_000, "2026-11-11", {
      recurrence: { freq: "monthly" },
    });
    const result = await compare("eva");
    expect(result?.total.currentCents).toBe(50_000 + 40_000 + 80_000);
  });

  it("lowers a category with a refund and never takes it below 0", async () => {
    const acc = await checking("fabio");
    const shop = await category("fabio", "Lojas");
    const home = await category("fabio", "Aluguel");
    await spend("fabio", acc, 30_000, "2026-11-03", { categoryId: shop });
    // A refund is an expense with a positive amount; the domain does not
    // create one, so the rows go in directly.
    for (const [categoryId, amountCents, occurredOn] of [
      [shop, 10_000, "2026-11-04"],
      [home, 50_000, "2026-11-05"],
    ] as const) {
      await db.insert(schema.transactions).values({
        userId: "fabio",
        accountId: acc,
        categoryId,
        kind: "expense",
        status: "paid",
        amountCents,
        description: "Estorno",
        occurredOn,
      });
    }
    await spend("fabio", acc, 20_000, "2026-10-05", { categoryId: home });
    const result = await compare("fabio");
    const byName = new Map(result?.categories.map((c) => [c.name, c]));
    expect(byName.get("Lojas")).toMatchObject({ currentCents: 20_000 });
    expect(byName.get("Aluguel")).toMatchObject({
      currentCents: 0,
      baselineCents: 20_000,
      direction: "down",
    });
    expect(result?.total.currentCents).toBe(20_000);
  });

  it("has no ratio, and no error, when the month before is empty", async () => {
    const acc = await checking("gil");
    await spend("gil", acc, 25_000, "2026-11-02");
    const result = await compare("gil");
    expect(result?.total).toMatchObject({
      currentCents: 25_000,
      baselineCents: 0,
      ratio: null,
      direction: "up",
    });
  });

  it("returns zeros for someone with nothing to compare", async () => {
    await checking("hugo");
    const result = await compare("hugo");
    expect(result?.total).toMatchObject({ currentCents: 0, baselineCents: 0 });
    expect(result?.categories).toEqual([]);
  });

  it("applies the limit of three and the minimum of R$ 10,00", async () => {
    const acc = await checking("iris");
    for (const [name, now, before] of [
      ["A", 50_000, 0],
      ["B", 40_000, 0],
      ["C", 30_000, 0],
      ["D", 20_000, 0],
      ["Pequena", 999, 0],
    ] as const) {
      const id = await category("iris", name);
      await spend("iris", acc, now, "2026-11-02", { categoryId: id });
      if (before) await spend("iris", acc, before, "2026-10-02");
    }
    const result = await compare("iris");
    expect(result?.categories.map((c) => c.name)).toEqual(["A", "B", "C"]);
    // The total covers every category, listed or not.
    expect(result?.total.currentCents).toBe(140_999);
  });

  it("clamps the previous window to its end (início dia 1, 30/mar/2027)", async () => {
    const acc = await checking("joao");
    await spend("joao", acc, 10_000, "2027-03-05");
    await spend("joao", acc, 3_000, "2027-02-28");
    await spend("joao", acc, 900_000, "2027-03-01");
    const now = Date.UTC(2027, 2, 30, 15, 0, 0);
    const result = await compare("joao", undefined, { now });
    expect(result?.previous).toEqual({
      start: "2027-02-01",
      end: "2027-02-28",
    });
    expect(result?.current).toEqual({ start: "2027-03-01", end: "2027-03-30" });
    expect(result?.total.baselineCents).toBe(3_000);
    // The 1st of March is this month's, never the previous one's.
    expect(result?.total.currentCents).toBe(910_000);
  });

  it("follows a financial month that starts on the 5th", async () => {
    const acc = await checking("kemi");
    await spend("kemi", acc, 10_000, "2027-04-03");
    await spend("kemi", acc, 4_000, "2027-03-04");
    await spend("kemi", acc, 9_000, "2027-03-05");
    await spend("kemi", acc, 900_000, "2027-03-20");
    const now = Date.UTC(2027, 3, 3, 15, 0, 0);
    const result = await compare("kemi", undefined, { now, monthStartDay: 5 });
    expect(result?.current).toEqual({ start: "2027-03-05", end: "2027-04-03" });
    expect(result?.total.currentCents).toBe(909_000 + 10_000);
    expect(result?.previous).toEqual({
      start: "2027-02-05",
      end: "2027-03-04",
    });
    expect(result?.total.baselineCents).toBe(4_000);
  });

  it("compares whole months on the last day and for a past month", async () => {
    const acc = await checking("lara");
    await spend("lara", acc, 10_000, "2026-11-30");
    await spend("lara", acc, 5_000, "2026-10-31");
    await spend("lara", acc, 7_000, "2026-10-20");
    const lastDay = await compare("lara", undefined, {
      now: Date.UTC(2026, 10, 30, 15, 0, 0),
    });
    expect(lastDay).toMatchObject({
      complete: true,
      previous: { start: "2026-10-01", end: "2026-10-31" },
    });
    expect(lastDay?.total.baselineCents).toBe(12_000);
    const past = await compare("lara", "2026-10");
    expect(past).toMatchObject({
      complete: true,
      month: "2026-10",
      previousMonth: "2026-09",
      current: { start: "2026-10-01", end: "2026-10-31" },
    });
    expect(past?.total.currentCents).toBe(12_000);
  });

  it("returns null for a month ahead", async () => {
    expect(await compare("lara", "2026-12")).toBeNull();
  });
});

describe("monthComparison, isolation", () => {
  it("never counts another person's expenses", async () => {
    const mine = await checking("mel");
    const theirs = await checking("ana");
    await spend("ana", theirs, 999_000, "2026-11-13");
    await spend("mel", mine, 1_000, "2026-11-13");
    const result = await compare("mel");
    expect(result?.total.currentCents).toBe(1_000);
  });

  it("counts an expense put in a group in full, for who entered it", async () => {
    const acc = await checking("bia");
    const own = await spend("bia", acc, 60_000, "2026-11-08");
    const before = (await compare("bia"))?.total.currentCents ?? 0;
    const ctx = await ctxOf("bia");
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
          eq(schema.shareMembers.userId, "bia"),
        ),
      );
    if (!member) throw new Error("sem membro");
    await d.expenses.addSharedExpenses(ctx, groupId, [
      {
        id: uuidv7(),
        description: "",
        amountCents: 1,
        occurredOn: "2026-11-08",
        paidByMemberId: member.id,
        transactionId: own,
        method: "equal",
        inputs: [{ memberId: member.id, value: 1 }],
      },
    ]);
    expect((await compare("bia"))?.total.currentCents).toBe(before);
  });
});
