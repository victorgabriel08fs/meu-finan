// Subcategories add up into their main category (doc 03 §11 and §12, the
// owner's D1 and D2): the budget of the parent, where the money went (the
// Início block, Visão geral, the weekly summary, the budget averages) and
// the Início insight. Against a real (in-memory) Postgres, on 14/out/2026.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  admin: typeof import("./category-admin");
  budgets: typeof import("./budgets");
  categories: typeof import("./categories");
  context: typeof import("./context");
  dashboard: typeof import("./dashboard");
  reports: typeof import("./reports");
  transactions: typeof import("./transactions");
};

let d: Domain;
const ctx = {} as Record<
  "ana" | "bruno" | "carla",
  import("./context").UserContext
>;
const wallet = {} as Record<"ana" | "bruno" | "carla", string>;
const market = {} as Record<"ana" | "bruno" | "carla", string>;
const ids = {} as Record<"fair" | "bakery" | "transport", string>;

// 14/out/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);
const OCTOBER = { start: "2026-10-01", end: "2026-10-31" };

async function spend(
  who: "ana" | "bruno" | "carla",
  categoryId: string,
  amountCents: number,
  occurredOn: string,
  paid?: boolean,
) {
  await d.transactions.createTransaction(ctx[who], {
    kind: "expense",
    amountCents,
    accountId: wallet[who],
    categoryId,
    description: "Compra",
    occurredOn,
    paid,
  });
}

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { db } = await import("../db/client");
  await migrate(db as never, { migrationsFolder: "drizzle" });
  const schema = await import("../db/schema");
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  d = {
    accounts: await import("./accounts"),
    admin: await import("./category-admin"),
    budgets: await import("./budgets"),
    categories: await import("./categories"),
    context: await import("./context"),
    dashboard: await import("./dashboard"),
    reports: await import("./reports"),
    transactions: await import("./transactions"),
  };
  for (const who of ["ana", "bruno", "carla"] as const) {
    await db
      .insert(schema.user)
      .values({ id: who, name: who, email: `${who}@exemplo.com` });
    await ensureOwnerDefaults(who);
    ctx[who] = await d.context.getUserContext(who, { now: NOW });
    wallet[who] = await d.accounts.createAccount(who, {
      name: "Carteira",
      type: "cash",
      initialBalanceCents: 0,
    });
    const found = (await d.categories.listCategories(who)).find(
      (category) => category.name === "Mercado",
    );
    if (!found) throw new Error("Mercado");
    market[who] = found.id;
  }
  const child = (userId: string, name: string, parentId: string) =>
    d.categories.createCategory(userId, {
      kind: "expense",
      name,
      icon: "carrot",
      color: "cat-1",
      parentId,
    });
  ids.fair = await child("ana", "Feira", market.ana);
  ids.bakery = await child("ana", "Padaria", market.ana);
  const transport = (await d.categories.listCategories("ana")).find(
    (category) => category.name === "Transporte",
  );
  if (!transport) throw new Error("Transporte");
  ids.transport = transport.id;

  // Ana, October: Mercado 100, Feira 50 paid + 30 scheduled, Padaria 20
  // (archived after), Transporte 40.
  await spend("ana", market.ana, 10_000, "2026-10-02");
  await spend("ana", ids.fair, 5_000, "2026-10-03");
  await spend("ana", ids.fair, 3_000, "2026-10-20");
  await spend("ana", ids.bakery, 2_000, "2026-10-04");
  await spend("ana", ids.transport, 4_000, "2026-10-05");
  await d.admin.setCategoryArchived("ana", ids.bakery, true);
  // Bruno spends in his own Mercado: never in Ana's numbers.
  await spend("bruno", market.bruno, 99_900, "2026-10-02");
}, 120_000);

describe("budgets (D1)", () => {
  it("the parent's budget counts its subcategories once, paid and scheduled", async () => {
    await d.budgets.upsertBudget(ctx.ana, {
      categoryId: market.ana,
      month: "2026-10",
      amountCents: 50_000,
    });
    const range = d.context.resolvePeriod(ctx.ana, "2026-10");
    const { items, total } = await d.budgets.getBudgets(ctx.ana, range);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      categoryId: market.ana,
      spentCents: 17_000,
      scheduledCents: 3_000,
    });
    expect(total).toMatchObject({ spentCents: 17_000, scheduledCents: 3_000 });
  });

  it("a new budget goes on a main category only; an old one on a subcategory counts only it", async () => {
    await expect(
      d.budgets.upsertBudget(ctx.ana, {
        categoryId: ids.fair,
        month: "2026-10",
        amountCents: 10_000,
      }),
    ).rejects.toThrow("Escolha uma categoria principal para o orçamento.");

    // A budget made before Feira became a subcategory.
    const { db } = await import("../db/client");
    const schema = await import("../db/schema");
    await db.insert(schema.budgets).values({
      userId: "ana",
      categoryId: ids.fair,
      month: "2026-10-01",
      amountCents: 10_000,
    });
    // Its amount can still change.
    await d.budgets.upsertBudget(ctx.ana, {
      categoryId: ids.fair,
      month: "2026-10",
      amountCents: 12_000,
    });
    const range = d.context.resolvePeriod(ctx.ana, "2026-10");
    const fair = (await d.budgets.getBudgets(ctx.ana, range)).items.find(
      (item) => item.categoryId === ids.fair,
    );
    expect(fair).toMatchObject({
      budgetCents: 12_000,
      spentCents: 5_000,
      scheduledCents: 3_000,
    });
  });

  it("copying the previous month skips an old subcategory budget", async () => {
    // October has Mercado (main) and Feira (an old subcategory budget).
    expect(
      await d.budgets.copyBudgetsFromPreviousMonth(ctx.ana, "2026-11"),
    ).toBe(1);
    const range = d.context.resolvePeriod(ctx.ana, "2026-11");
    const { items } = await d.budgets.getBudgets(ctx.ana, range);
    expect(items.map((item) => item.categoryId)).toEqual([market.ana]);
  });

  it("Bruno's budget sees none of Ana's spending", async () => {
    await d.budgets.upsertBudget(ctx.bruno, {
      categoryId: market.bruno,
      month: "2026-10",
      amountCents: 10_000,
    });
    const range = d.context.resolvePeriod(ctx.bruno, "2026-10");
    const { items } = await d.budgets.getBudgets(ctx.bruno, range);
    expect(items.map((item) => item.spentCents)).toEqual([99_900]);
  });
});

describe("where the money went (D2)", () => {
  it("adds the subcategories (archived ones too) into the parent", async () => {
    const { items, totalCents } = await d.reports.categoryBreakdown(
      ctx.ana,
      OCTOBER.start,
      OCTOBER.end,
    );
    expect(
      items.map((item) => [item.categoryId, item.name, item.cents]),
    ).toEqual([
      [market.ana, "Mercado", 17_000],
      [ids.transport, "Transporte", 4_000],
    ]);
    expect(totalCents).toBe(21_000);
  });

  it("keeps each person's numbers apart", async () => {
    const bruno = await d.reports.categoryBreakdown(
      ctx.bruno,
      OCTOBER.start,
      OCTOBER.end,
    );
    expect(bruno.items.map((item) => [item.name, item.cents])).toEqual([
      ["Mercado", 99_900],
    ]);
  });
});

describe("the Início insight (D2)", () => {
  it("compares the parent with its subcategories added up", async () => {
    // Carla: Feira (under Mercado) by the 5th of each of the last 3 months,
    // and three times as much in Mercado and Feira this month.
    const fair = await d.categories.createCategory("carla", {
      kind: "expense",
      name: "Feira",
      icon: "carrot",
      color: "cat-1",
      parentId: market.carla,
    });
    for (const month of ["07", "08", "09"]) {
      await spend("carla", fair, 10_000, `2026-${month}-05`);
    }
    await spend("carla", fair, 20_000, "2026-10-05");
    await spend("carla", market.carla, 10_000, "2026-10-06");

    const range = d.context.resolvePeriod(ctx.carla, null);
    const insight = await d.dashboard.categoryInsight(ctx.carla, range);
    expect(insight).toMatchObject({
      tone: "attention",
      categoryId: market.carla,
      categoryName: "Mercado",
      changeRatio: 2,
    });
  });
});
