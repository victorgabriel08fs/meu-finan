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
