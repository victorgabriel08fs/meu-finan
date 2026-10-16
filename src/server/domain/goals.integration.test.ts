// Goal detail and "Aportar" against a real (in-memory) Postgres: ownership,
// contributions as transfers or as saved amounts, "Desfazer" and the history
// of a linked account (doc 02 §6.10, doc 03 §8), on 14/out/2026.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  goals: typeof import("./goals");
  transactions: typeof import("./transactions");
};

let d: Domain;
let ctx: import("./context").UserContext;
let intruder: import("./context").UserContext;
const ids = {} as Record<
  "checking" | "reserve" | "card" | "othersAccount" | "yields",
  string
>;

// 14/out/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);

const goalInput = (
  patch: Partial<import("./goals").GoalInput> = {},
): import("./goals").GoalInput => ({
  name: "Reserva de emergência",
  icon: "piggy-bank",
  color: "cat-3",
  targetCents: 300_000,
  targetDate: null,
  accountId: null,
  savedCents: 0,
  monthlyPlanCents: 50_000,
  expectedRate: null,
  ...patch,
});

async function balances() {
  const accounts = await d.accounts.listAccounts("owner");
  const of = (id: string) => accounts.find((account) => account.id === id);
  return {
    checking: of(ids.checking)?.balanceCents,
    reserve: of(ids.reserve)?.balanceCents,
    reservePending: of(ids.reserve)?.pendingCents,
  };
}

async function detail(id: string) {
  const goal = await d.goals.getGoal(ctx, id);
  if (!goal) throw new Error(`meta ${id}`);
  return goal;
}

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { db } = await import("../db/client");
  await migrate(db as never, { migrationsFolder: "drizzle" });
  const schema = await import("../db/schema");
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  await db.insert(schema.user).values([
    { id: "owner", name: "Ana", email: "ana@exemplo.com" },
    { id: "intruder", name: "Outra pessoa", email: "outra@exemplo.com" },
  ]);
  await ensureOwnerDefaults("owner");
  await ensureOwnerDefaults("intruder");

  d = {
    accounts: await import("./accounts"),
    goals: await import("./goals"),
    transactions: await import("./transactions"),
  };
  const context = await import("./context");
  ctx = await context.getUserContext("owner", { now: NOW });
  intruder = await context.getUserContext("intruder", { now: NOW });

  ids.checking = await d.accounts.createAccount("owner", {
    name: "Conta principal",
    type: "checking",
    initialBalanceCents: 500_000,
  });
  ids.reserve = await d.accounts.createAccount("owner", {
    name: "Reserva",
    type: "investment",
    initialBalanceCents: 100_000,
  });
  ids.card = await d.accounts.createAccount("owner", {
    name: "Cartão Principal",
    type: "credit_card",
    initialBalanceCents: 0,
    card: { limitCents: 550_000, closingDay: 17, dueDay: 25 },
  });
  ids.othersAccount = await d.accounts.createAccount("intruder", {
    name: "Conta da outra pessoa",
    type: "checking",
    initialBalanceCents: 1_000_000,
  });
  const { listCategories } = await import("./categories");
  const yields = (await listCategories("owner")).find(
    (category) => category.name === "Rendimentos",
  );
  if (!yields) throw new Error("categoria Rendimentos");
  ids.yields = yields.id;
}, 120_000);

describe("ownership", () => {
  let goalId: string;

  beforeAll(async () => {
    goalId = await d.goals.createGoal(
      ctx,
      goalInput({ name: "Viagem", savedCents: 20_000 }),
    );
  });

  it("does not show another user's goal", async () => {
    expect(await d.goals.getGoal(intruder, goalId)).toBeNull();
    expect(await d.goals.getGoal(ctx, goalId)).toMatchObject({
      name: "Viagem",
      currentCents: 20_000,
    });
  });

  it("returns null for a malformed or unknown id", async () => {
    expect(await d.goals.getGoal(ctx, "nao-e-um-id")).toBeNull();
    expect(
      await d.goals.getGoal(ctx, "01900000-0000-7000-8000-000000000000"),
    ).toBeNull();
  });

  it("rejects contributions and undos on another user's goal", async () => {
    await expect(
      d.goals.contributeToGoal(intruder, goalId, { amountCents: 1_000 }),
    ).rejects.toThrow("Meta não encontrado(a).");
    await expect(
      d.goals.undoGoalContribution(intruder, goalId, 1_000),
    ).rejects.toThrow("Meta não encontrado(a).");
    expect((await detail(goalId)).currentCents).toBe(20_000);
  });

  it("rejects a source account that belongs to someone else", async () => {
    const linked = await d.goals.createGoal(
      ctx,
      goalInput({ name: "Carro", accountId: ids.reserve }),
    );
    await expect(
      d.goals.contributeToGoal(ctx, linked, {
        amountCents: 1_000,
        fromAccountId: ids.othersAccount,
      }),
    ).rejects.toThrow("Conta não encontrado(a).");
    expect(await balances()).toMatchObject({
      checking: 500_000,
      reserve: 100_000,
    });
    await d.goals.archiveGoal(ctx, linked);
  });

  it("reads no history from someone else's account", async () => {
    expect(
      await d.goals.goalContributions(intruder, {
        accountId: ids.reserve,
        linked: true,
      }),
    ).toEqual([]);
  });
});

describe("linked goal", () => {
  let goalId: string;
  const REQUEST = "01900000-0000-7000-8000-00000000a0a0";

  beforeAll(async () => {
    goalId = await d.goals.createGoal(
      ctx,
      goalInput({ accountId: ids.reserve }),
    );
  });

  it("follows the account's balance", async () => {
    expect(await detail(goalId)).toMatchObject({
      linked: true,
      archived: false,
      accountId: ids.reserve,
      accountName: "Reserva",
      currentCents: 100_000,
      progress: 1 / 3,
    });
  });

  it("contributes with a transfer and undoes it", async () => {
    const result = await d.goals.contributeToGoal(ctx, goalId, {
      amountCents: 50_000,
      fromAccountId: ids.checking,
      requestId: REQUEST,
    });
    expect(result).toMatchObject({
      kind: "transfer",
      scheduled: false,
      achieved: false,
    });
    if (result.kind !== "transfer") throw new Error("transferência");
    expect(await balances()).toMatchObject({
      checking: 450_000,
      reserve: 150_000,
    });
    expect((await detail(goalId)).currentCents).toBe(150_000);

    const { items } = await d.transactions.listTransactions(ctx, {
      start: "2026-10-14",
      end: "2026-10-14",
      accountId: ids.reserve,
    });
    expect(items.map((item) => [item.kind, item.description])).toEqual([
      ["transfer", "Aporte · Reserva de emergência"],
    ]);

    // Sending the same contribution again creates nothing new.
    expect(
      await d.goals.contributeToGoal(ctx, goalId, {
        amountCents: 50_000,
        fromAccountId: ids.checking,
        requestId: REQUEST,
      }),
    ).toMatchObject({ kind: "transfer", transferId: result.transferId });
    expect((await balances()).reserve).toBe(150_000);

    // "Desfazer": the transfer is discarded, both legs.
    const discarded = await d.transactions.discardCreated(ctx, {
      transferId: result.transferId,
    });
    expect(discarded).toHaveLength(2);
    expect(await balances()).toMatchObject({
      checking: 500_000,
      reserve: 100_000,
    });
  });

  it("schedules a contribution dated ahead", async () => {
    const result = await d.goals.contributeToGoal(ctx, goalId, {
      amountCents: 20_000,
      fromAccountId: ids.checking,
      occurredOn: "2026-10-20",
    });
    expect(result).toMatchObject({ kind: "transfer", scheduled: true });
    expect(await balances()).toMatchObject({
      reserve: 100_000,
      reservePending: 20_000,
    });
    if (result.kind !== "transfer") throw new Error("transferência");
    await d.transactions.discardCreated(ctx, {
      transferId: result.transferId,
    });
  });

  it("tells when the contribution reaches the target", async () => {
    const result = await d.goals.contributeToGoal(ctx, goalId, {
      amountCents: 200_000,
      fromAccountId: ids.checking,
    });
    expect(result).toMatchObject({ kind: "transfer", achieved: true });
    expect((await detail(goalId)).projection.status).toBe("achieved");
    if (result.kind !== "transfer") throw new Error("transferência");
    await d.transactions.discardCreated(ctx, {
      transferId: result.transferId,
    });
  });

  it("refuses the goal's own account, a card or no account as the source", async () => {
    const contribute = (input: import("./goals").ContributionInput) =>
      d.goals.contributeToGoal(ctx, goalId, input);
    await expect(
      contribute({ amountCents: 1_000, fromAccountId: ids.reserve }),
    ).rejects.toThrow("conta diferente da conta da meta");
    await expect(
      contribute({ amountCents: 1_000, fromAccountId: ids.card }),
    ).rejects.toThrow("não de um cartão");
    await expect(contribute({ amountCents: 1_000 })).rejects.toThrow(
      "Escolha de qual conta sai o aporte.",
    );
    await expect(
      contribute({ amountCents: 0, fromAccountId: ids.checking }),
    ).rejects.toThrow("maior que zero");
    expect(await balances()).toMatchObject({
      checking: 500_000,
      reserve: 100_000,
    });
  });

  it("builds the history of the account month by month", async () => {
    await d.transactions.createTransaction(ctx, {
      kind: "income",
      amountCents: 30_000,
      accountId: ids.reserve,
      categoryId: ids.yields,
      description: "Rendimento",
      occurredOn: "2026-08-10",
    });
    await d.transactions.createTransfer(ctx, {
      fromAccountId: ids.reserve,
      toAccountId: ids.checking,
      amountCents: 10_000,
      occurredOn: "2026-09-05",
    });
    await d.goals.contributeToGoal(ctx, goalId, {
      amountCents: 40_000,
      fromAccountId: ids.checking,
    });

    const history = await d.goals.goalContributions(ctx, await detail(goalId));
    expect(history.map((month) => month.month)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(history.slice(-4)).toEqual([
      { month: "2026-07", contributionCents: 0, balanceCents: 100_000 },
      // Income counts as money in; the transfer out only lowers the balance.
      { month: "2026-08", contributionCents: 30_000, balanceCents: 130_000 },
      { month: "2026-09", contributionCents: 0, balanceCents: 120_000 },
      // Discarded contributions (above) are left out.
      { month: "2026-10", contributionCents: 40_000, balanceCents: 160_000 },
    ]);
    expect((await detail(goalId)).currentCents).toBe(160_000);
  });
});

describe("goal without a linked account", () => {
  let goalId: string;

  beforeAll(async () => {
    goalId = await d.goals.createGoal(
      ctx,
      goalInput({ name: "Notebook", targetCents: 100_000, savedCents: 10_000 }),
    );
  });

  it("adds the contribution to the saved amount, with no ledger entry", async () => {
    const before = await balances();
    expect(
      await d.goals.contributeToGoal(ctx, goalId, { amountCents: 5_000 }),
    ).toEqual({ kind: "saved", savedCents: 15_000, achieved: false });
    expect(await detail(goalId)).toMatchObject({
      linked: false,
      currentCents: 15_000,
    });
    expect(await balances()).toEqual(before);
  });

  it("undoes it by taking the amount back out, never below zero", async () => {
    expect(await d.goals.undoGoalContribution(ctx, goalId, 5_000)).toEqual({
      savedCents: 10_000,
    });
    expect(await d.goals.undoGoalContribution(ctx, goalId, 50_000)).toEqual({
      savedCents: 0,
    });
    expect((await detail(goalId)).currentCents).toBe(0);
  });

  it("tells when the contribution reaches the target", async () => {
    expect(
      await d.goals.contributeToGoal(ctx, goalId, { amountCents: 100_000 }),
    ).toEqual({ kind: "saved", savedCents: 100_000, achieved: true });
  });

  it("has no history", async () => {
    expect(await d.goals.goalContributions(ctx, await detail(goalId))).toEqual(
      [],
    );
  });
});

describe("archived goals and accounts", () => {
  it("finds an archived goal but takes no contribution to it", async () => {
    const id = await d.goals.createGoal(ctx, goalInput({ name: "Antiga" }));
    await d.goals.archiveGoal(ctx, id);
    expect(await d.goals.getGoal(ctx, id)).toMatchObject({ archived: true });
    await expect(
      d.goals.contributeToGoal(ctx, id, { amountCents: 1_000 }),
    ).rejects.toThrow("Meta não encontrado(a).");
  });

  it("treats a goal whose account was archived as not linked", async () => {
    const account = await d.accounts.createAccount("owner", {
      name: "Poupança antiga",
      type: "savings",
      initialBalanceCents: 80_000,
    });
    const id = await d.goals.createGoal(
      ctx,
      goalInput({ name: "Moto", accountId: account }),
    );
    await d.accounts.archiveAccount("owner", account);
    expect(await detail(id)).toMatchObject({
      linked: false,
      accountName: null,
      currentCents: 0,
    });
    // As in the list, its progress is the amount saved by hand.
    expect(
      await d.goals.contributeToGoal(ctx, id, { amountCents: 2_000 }),
    ).toMatchObject({ kind: "saved", savedCents: 2_000 });
    expect((await detail(id)).currentCents).toBe(2_000);
  });
});
