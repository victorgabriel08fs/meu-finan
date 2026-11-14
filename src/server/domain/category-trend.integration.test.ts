// Gasto por categoria principal em dias 1..E do período e dos 3 anteriores
// (doc 03 §12), contra um Postgres de verdade (em memória). O caso central é o
// da janela: um período anterior mais curto não invade o período seguinte.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  categories: typeof import("./categories");
  trend: typeof import("./category-trend");
  context: typeof import("./context");
  transactions: typeof import("./transactions");
};

let d: Domain;
let db: typeof import("../db/client").db;
let schema: typeof import("../db/schema");

// 30/mar/2027, 12:00 em São Paulo.
const MARCH_30 = Date.UTC(2027, 2, 30, 15, 0, 0);
// 03/abr/2027, 12:00 em São Paulo.
const APRIL_3 = Date.UTC(2027, 3, 3, 15, 0, 0);

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

/** Insere direto: a data pode ser qualquer uma, sem depender de "hoje". */
async function row(
  userId: string,
  accountId: string,
  categoryId: string | null,
  amountCents: number,
  occurredOn: string,
  extra: Partial<typeof schema.transactions.$inferInsert> = {},
) {
  await db.insert(schema.transactions).values({
    userId,
    accountId,
    categoryId,
    kind: "expense",
    status: "paid",
    amountCents: -amountCents,
    description: "Gasto",
    occurredOn,
    ...extra,
  });
}

async function trendOf(
  id: string,
  now: number,
  monthStartDay?: number,
  month: string | null = null,
) {
  const base = await d.context.getUserContext(id, { now });
  const ctx = monthStartDay ? { ...base, monthStartDay } : base;
  const result = await d.trend.categorySpendingTrend(
    ctx,
    d.context.resolvePeriod(ctx, month),
  );
  return result;
}

const byName = (rows: { name: string }[] | undefined) =>
  new Map(rows?.map((r) => [r.name, r]));

const PEOPLE = ["ana", "bia", "caio", "dora", "eva", "fabio", "gil", "hugo"];

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  schema = await import("../db/schema");
  d = {
    accounts: await import("./accounts"),
    categories: await import("./categories"),
    trend: await import("./category-trend"),
    context: await import("./context"),
    transactions: await import("./transactions"),
  };
  for (const id of PEOPLE) await person(id);
}, 120_000);

describe("categorySpendingTrend: janelas", () => {
  it("início dia 1, hoje 30/mar: fevereiro só vai de 1 a 28 e 1/mar não entra no histórico", async () => {
    const acc = await checking("ana");
    const shop = await category("ana", "Lojas");
    // Atual: 1..30/mar.
    await row("ana", acc, shop, 10_000, "2027-03-02");
    await row("ana", acc, shop, 5_000, "2027-03-30");
    // Hoje não conta amanhã: 31/mar fica fora da janela atual.
    await row("ana", acc, shop, 99_000, "2027-03-31");
    // Fevereiro: 1..28. A janela sem limite iria até 2/mar e levaria 1/mar.
    await row("ana", acc, shop, 20_000, "2027-02-01");
    await row("ana", acc, shop, 10_000, "2027-02-28");
    // Janeiro: 1..30 (31/jan fica fora). Dezembro: 1..30.
    await row("ana", acc, shop, 30_000, "2027-01-30");
    await row("ana", acc, shop, 77_000, "2027-01-31");
    await row("ana", acc, shop, 40_000, "2026-12-30");
    await row("ana", acc, shop, 88_000, "2026-12-31");
    // Fora do histórico de 3 períodos.
    await row("ana", acc, shop, 66_000, "2026-11-10");

    const result = await trendOf("ana", MARCH_30);
    expect(result?.month).toBe("2027-03");
    expect(result?.windows.elapsedDays).toBe(30);
    const [shopRow] = result?.rows ?? [];
    expect(shopRow).toMatchObject({
      name: "Lojas",
      currentCents: 15_000,
      historyCents: [30_000, 30_000, 40_000],
    });
  });

  it("a despesa de 1/mar não entra em fevereiro", async () => {
    const acc = await checking("bia");
    const shop = await category("bia", "Lojas");
    await row("bia", acc, shop, 12_000, "2027-03-01");
    await row("bia", acc, shop, 7_000, "2027-02-10");
    await row("bia", acc, shop, 8_000, "2027-01-10");
    await row("bia", acc, shop, 9_000, "2026-12-10");
    const result = await trendOf("bia", MARCH_30);
    expect(result?.rows[0]).toMatchObject({
      currentCents: 12_000,
      historyCents: [7_000, 8_000, 9_000],
    });
  });

  it("início dia 5, hoje 03/abr: o período anterior vai de 5/fev a 4/mar", async () => {
    const acc = await checking("caio");
    const shop = await category("caio", "Lojas");
    // Atual: 5/mar..3/abr.
    await row("caio", acc, shop, 1_000, "2027-03-05");
    await row("caio", acc, shop, 2_000, "2027-04-03");
    await row("caio", acc, shop, 90_000, "2027-04-04");
    // Anterior: 5/fev..4/mar (limitado ao fim dele). 4/mar entra, 5/mar não.
    await row("caio", acc, shop, 3_000, "2027-02-05");
    await row("caio", acc, shop, 4_000, "2027-03-04");
    await row("caio", acc, shop, 80_000, "2027-02-04");
    // Dois períodos atrás: 5/jan..3/fev (30 dias); 4/fev fica fora.
    await row("caio", acc, shop, 5_000, "2027-02-03");
    await row("caio", acc, shop, 6_000, "2027-01-05");
    const result = await trendOf("caio", APRIL_3, 5);
    expect(result?.month).toBe("2027-03");
    expect(result?.rows[0]).toMatchObject({
      currentCents: 3_000,
      historyCents: [7_000, 11_000, 0],
    });
  });
});

describe("categorySpendingTrend: o que conta", () => {
  it("soma a subcategoria na categoria principal", async () => {
    const acc = await checking("dora");
    const home = await category("dora", "Casa");
    const rent = await category("dora", "Reforma", home);
    await row("dora", acc, home, 10_000, "2027-03-03");
    await row("dora", acc, rent, 5_000, "2027-03-04");
    await row("dora", acc, rent, 6_000, "2027-02-04");
    const result = await trendOf("dora", MARCH_30);
    expect(result?.rows).toHaveLength(1);
    expect(result?.rows[0]).toMatchObject({
      name: "Casa",
      currentCents: 15_000,
      historyCents: [6_000, 0, 0],
    });
  });

  it("deixa fora sem categoria, pendente, transferência, ajuste, receita e excluída", async () => {
    const acc = await checking("eva");
    const other = await d.accounts.createAccount("eva", {
      name: "Reserva",
      type: "savings",
      initialBalanceCents: 0,
    });
    const shop = await category("eva", "Lojas");
    const ctx = await d.context.getUserContext("eva", { now: MARCH_30 });
    await row("eva", acc, null, 50_000, "2027-03-03");
    await row("eva", acc, shop, 40_000, "2027-03-03", { status: "pending" });
    await row("eva", acc, shop, 30_000, "2027-03-03", {
      deletedAt: new Date(Date.UTC(2027, 2, 10)),
    });
    await row("eva", acc, shop, 20_000, "2027-03-03", { kind: "income" });
    await d.transactions.createTransfer(ctx, {
      fromAccountId: acc,
      toAccountId: other,
      amountCents: 500_000,
      occurredOn: "2027-03-03",
    });
    await d.accounts.adjustBalance(ctx, acc, 9_000_000);
    await row("eva", acc, shop, 1_500, "2027-03-03");
    const result = await trendOf("eva", MARCH_30);
    expect(result?.rows).toHaveLength(1);
    expect(result?.rows[0]).toMatchObject({
      name: "Lojas",
      currentCents: 1_500,
    });
  });

  it("estorno abaixa a categoria e ela nunca fica negativa", async () => {
    const acc = await checking("fabio");
    const shop = await category("fabio", "Lojas");
    const home = await category("fabio", "Aluguel");
    await row("fabio", acc, shop, 30_000, "2027-03-03");
    await row("fabio", acc, shop, -10_000, "2027-03-04"); // estorno
    await row("fabio", acc, home, -50_000, "2027-03-05"); // só estorno
    await row("fabio", acc, home, 20_000, "2027-02-05");
    const result = await trendOf("fabio", MARCH_30);
    const rows = byName(result?.rows);
    expect(rows.get("Lojas")).toMatchObject({ currentCents: 20_000 });
    expect(rows.get("Aluguel")).toMatchObject({
      currentCents: 0,
      historyCents: [20_000, 0, 0],
    });
  });

  it("não lê as linhas de outra conta (isolamento)", async () => {
    const accGil = await checking("gil");
    const accHugo = await checking("hugo");
    const shopGil = await category("gil", "Lojas");
    const shopHugo = await category("hugo", "Lojas");
    await row("gil", accGil, shopGil, 11_000, "2027-03-03");
    await row("hugo", accHugo, shopHugo, 99_000, "2027-03-03");
    await row("hugo", accHugo, shopHugo, 88_000, "2027-02-03");
    const gil = await trendOf("gil", MARCH_30);
    expect(gil?.rows).toHaveLength(1);
    expect(gil?.rows[0]).toMatchObject({
      categoryId: shopGil,
      currentCents: 11_000,
      historyCents: [0, 0, 0],
    });
    const hugo = await trendOf("hugo", MARCH_30);
    expect(hugo?.rows[0]).toMatchObject({
      categoryId: shopHugo,
      currentCents: 99_000,
      historyCents: [88_000, 0, 0],
    });
  });

  it("devolve null para um período que ainda não começou", async () => {
    await checking("ana");
    expect(await trendOf("ana", MARCH_30, undefined, "2027-04")).toBeNull();
  });
});
