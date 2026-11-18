// Where each person's records begin (the "Sem registros" of the Fluxo and the
// Patrimônio), against a real (in-memory) Postgres.
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  context: typeof import("./context");
  readsModule: typeof import("./request-reads");
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

/** An account whose creation is moved to a chosen instant. */
async function account(userId: string, createdAt: string) {
  const id = await d.accounts.createAccount(userId, {
    name: "Conta",
    type: "checking",
    initialBalanceCents: 0,
  });
  await db
    .update(schema.finAccounts)
    .set({ createdAt: new Date(createdAt) })
    .where(eq(schema.finAccounts.id, id));
  return id;
}

async function expenseOn(userId: string, accountId: string, on: string) {
  const ctx = await ctxOf(userId);
  const { ids } = await d.transactions.createTransaction(ctx, {
    kind: "expense",
    amountCents: 1_000,
    accountId,
    categoryId: null,
    description: "Mercado",
    occurredOn: on,
  });
  return { ctx, id: ids[0] as string };
}

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  schema = await import("../db/schema");
  d = {
    accounts: await import("./accounts"),
    context: await import("./context"),
    readsModule: await import("./request-reads"),
    transactions: await import("./transactions"),
  };
}, 60_000);

describe("firstRecordOn", () => {
  it("is null for someone with no accounts and no entries", async () => {
    await person("vazio");
    expect(await d.readsModule.firstRecordOn(await ctxOf("vazio"))).toBeNull();
  });

  it("is the creation day of the account when there are no entries, in the person's time zone", async () => {
    await person("so-conta");
    // 02:30 UTC on 1/mar is still 28/fev in São Paulo.
    await account("so-conta", "2026-03-01T02:30:00Z");
    expect(await d.readsModule.firstRecordOn(await ctxOf("so-conta"))).toBe(
      "2026-02-28",
    );
  });

  it("goes back to an entry dated before the account", async () => {
    await person("retroativo");
    const accountId = await account("retroativo", "2026-05-10T12:00:00Z");
    await expenseOn("retroativo", accountId, "2026-01-20");
    await expenseOn("retroativo", accountId, "2026-08-02");
    expect(await d.readsModule.firstRecordOn(await ctxOf("retroativo"))).toBe(
      "2026-01-20",
    );
  });

  it("counts a pending entry and an archived account, not a deleted entry", async () => {
    await person("arquivada");
    const old = await account("arquivada", "2026-02-01T12:00:00Z");
    await d.accounts.archiveAccount("arquivada", old);
    const current = await account("arquivada", "2026-06-01T12:00:00Z");
    const deleted = await expenseOn("arquivada", current, "2025-11-03");
    await d.transactions.deleteTransaction(deleted.ctx, deleted.id);
    expect(await d.readsModule.firstRecordOn(await ctxOf("arquivada"))).toBe(
      "2026-02-01",
    );

    await person("pendente");
    const pendingAccount = await account("pendente", "2026-06-01T12:00:00Z");
    const ctx = await ctxOf("pendente");
    await d.transactions.createTransaction(ctx, {
      kind: "expense",
      amountCents: 5_000,
      accountId: pendingAccount,
      categoryId: null,
      description: "Luz",
      occurredOn: "2026-04-10",
      paid: false,
    });
    expect(await d.readsModule.firstRecordOn(ctx)).toBe("2026-04-10");
  });

  it("never reads another person's records", async () => {
    await person("vizinho");
    const accountId = await account("vizinho", "2020-01-01T12:00:00Z");
    await expenseOn("vizinho", accountId, "2019-06-01");
    await person("isolada");
    await account("isolada", "2026-09-09T12:00:00Z");
    expect(await d.readsModule.firstRecordOn(await ctxOf("isolada"))).toBe(
      "2026-09-09",
    );
  });
});

describe("listAccountOptions and the Nova transação", () => {
  it("lists only the person's active accounts, in order, with the card's cycle and no balance", async () => {
    await person("opcoes");
    await person("outra-pessoa");
    const checking = await d.accounts.createAccount("opcoes", {
      name: "Corrente",
      type: "checking",
      initialBalanceCents: 50_000,
    });
    const card = await d.accounts.createAccount("opcoes", {
      name: "Cartão",
      type: "credit_card",
      initialBalanceCents: 0,
      card: { limitCents: 100_000, closingDay: 5, dueDay: 12 },
    });
    const old = await d.accounts.createAccount("opcoes", {
      name: "Antiga",
      type: "cash",
      initialBalanceCents: 0,
    });
    await d.accounts.archiveAccount("opcoes", old);
    await d.accounts.createAccount("outra-pessoa", {
      name: "De outra pessoa",
      type: "checking",
      initialBalanceCents: 0,
    });

    const options = await d.accounts.listAccountOptions("opcoes");
    const full = await d.accounts.listAccounts("opcoes");
    expect(options.map((item) => item.id)).toEqual(full.map((a) => a.id));
    expect(options.map((item) => item.id)).toEqual([checking, card]);
    expect(options[0]).toEqual({
      id: checking,
      name: "Corrente",
      type: "checking",
      icon: full[0]?.icon,
      color: full[0]?.color,
      card: null,
    });
    expect(options[1]?.card).toEqual({ closingDay: 5, dueDay: 12 });

    const { getQuickAddData } = await import("./quick-add");
    const quickAdd = await getQuickAddData(await ctxOf("opcoes"));
    expect(quickAdd.accounts.map((item) => [item.id, item.card])).toEqual([
      [checking, null],
      [card, { closingDay: 5, dueDay: 12 }],
    ]);
  });

  it("counts only the person's own entries in the categories by use", async () => {
    await person("uso");
    const accountId = await account("uso", "2026-09-01T12:00:00Z");
    const { listCategories, categoriesByUse } = await import("./categories");
    const categories = await listCategories("uso");
    const rarely = categories.filter((item) => item.kind === "expense").at(-1);
    if (!rarely) throw new Error("categoria");
    const ctx = await ctxOf("uso");
    await d.transactions.createTransaction(ctx, {
      kind: "expense",
      amountCents: 1_000,
      accountId,
      categoryId: rarely.id,
      description: "Uso",
      occurredOn: "2026-10-10",
    });
    const byUse = await categoriesByUse("uso", "expense", "2026-07-16");
    expect(byUse[0]?.id).toBe(rarely.id);
  });

  it("defaults the form to the last entry's account, but never a caixinha or a benefício", async () => {
    await person("ultima");
    const checking = await d.accounts.createAccount("ultima", {
      name: "Corrente",
      type: "checking",
      initialBalanceCents: 0,
    });
    const box = await d.accounts.createAccount("ultima", {
      name: "Caixinha",
      type: "savings_box",
      initialBalanceCents: 10_000,
    });
    const { getQuickAddData } = await import("./quick-add");
    expect((await getQuickAddData(await ctxOf("ultima"))).lastAccountId).toBe(
      checking,
    );
    const ctx = await ctxOf("ultima");
    await d.transactions.createTransaction(ctx, {
      kind: "expense",
      amountCents: 500,
      accountId: box,
      categoryId: null,
      description: "Da caixinha",
      occurredOn: "2026-10-13",
    });
    expect((await getQuickAddData(ctx)).lastAccountId).toBe(checking);
  });
});
