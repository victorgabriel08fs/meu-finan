// The caixinha (doc 02 §6.7, doc 03 §12): in the net worth, outside the Saldo
// em contas, the forecast, the Fluxo and the daily notices, against a real
// (in-memory) Postgres, on 14/out/2026.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  context: typeof import("./context");
  dashboard: typeof import("./dashboard");
  reminders: typeof import("./reminders");
  reports: typeof import("./reports");
  transactions: typeof import("./transactions");
};

let d: Domain;
let db: typeof import("../db/client").db;
let schema: typeof import("../db/schema");

// 14/out/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);
const TODAY = "2026-10-14";
const LATER = "2026-10-20";

const ctxOf = (userId: string) =>
  d.context.getUserContext(userId, { now: NOW });
const rangeOf = (ctx: import("./context").UserContext) =>
  d.context.resolvePeriod(ctx, "2026-10");

async function person(id: string) {
  await db
    .insert(schema.user)
    .values({ id, name: id, email: `${id}@exemplo.com` });
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  await ensureOwnerDefaults(id);
}

/** A person with a Conta (R$ 1.000,00) and a Caixinha (zero). */
async function withBox(id: string) {
  await person(id);
  const checking = await d.accounts.createAccount(id, {
    name: "Conta",
    type: "checking",
    initialBalanceCents: 100_000,
  });
  const box = await d.accounts.createAccount(id, {
    name: "Caixinha",
    type: "savings_box",
    initialBalanceCents: 0,
  });
  return { checking, box, ctx: await ctxOf(id) };
}

const netWorth = async (id: string) =>
  (await d.accounts.listAccounts(id)).reduce(
    (sum, account) => sum + account.balanceCents,
    0,
  );

const summaryOf = async (id: string) => {
  const ctx = await ctxOf(id);
  return d.dashboard.getBalanceSummary(ctx, rangeOf(ctx));
};

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  schema = await import("../db/schema");
  d = {
    accounts: await import("./accounts"),
    context: await import("./context"),
    dashboard: await import("./dashboard"),
    reminders: await import("./reminders"),
    reports: await import("./reports"),
    transactions: await import("./transactions"),
  };
}, 60_000);

describe("the savings_box type", () => {
  it("is accepted by the database and gets the vault icon and the green color", async () => {
    await person("tipo");
    const id = await d.accounts.createAccount("tipo", {
      name: "Viagem",
      type: "savings_box",
      initialBalanceCents: 5_000,
    });
    const box = (await d.accounts.listAccounts("tipo")).find(
      (account) => account.id === id,
    );
    expect(box).toMatchObject({
      type: "savings_box",
      icon: "vault",
      color: "cat-6",
      balanceCents: 5_000,
    });
  });
});

describe("saving into a caixinha and getting it back", () => {
  it("moves the Saldo, not the net worth, nor income and expense", async () => {
    const { checking, box, ctx } = await withBox("guardar");
    const range = rangeOf(ctx);
    expect(await summaryOf("guardar")).toMatchObject({
      balanceCents: 100_000,
      monthChangeCents: 0,
      savingsBoxCents: 0,
    });
    const worthBefore = await netWorth("guardar");

    await d.transactions.createTransfer(ctx, {
      fromAccountId: checking,
      toAccountId: box,
      amountCents: 10_000,
      occurredOn: TODAY,
    });
    expect(await summaryOf("guardar")).toMatchObject({
      balanceCents: 90_000,
      monthChangeCents: -10_000,
      savingsBoxCents: 10_000,
    });
    expect(await netWorth("guardar")).toBe(worthBefore);
    const totals = await d.transactions.periodTotals(
      ctx,
      range.start,
      range.end,
    );
    // Math.abs: an expense total of nothing comes out as -0.
    expect(totals.incomeCents).toBe(0);
    expect(Math.abs(totals.expenseCents)).toBe(0);

    await d.transactions.createTransfer(ctx, {
      fromAccountId: box,
      toAccountId: checking,
      amountCents: 10_000,
      occurredOn: TODAY,
    });
    expect(await summaryOf("guardar")).toMatchObject({
      balanceCents: 100_000,
      monthChangeCents: 0,
      savingsBoxCents: 0,
    });
  });

  it("lowers the forecast with a transfer scheduled into the caixinha and raises it with one coming out", async () => {
    const { checking, box, ctx } = await withBox("agendada");
    const range = rangeOf(ctx);
    const base = (await d.dashboard.forecastUntil(ctx, range.end)).forecast
      .forecastCents;

    await d.transactions.createTransfer(ctx, {
      fromAccountId: checking,
      toAccountId: box,
      amountCents: 10_000,
      occurredOn: LATER,
    });
    const scheduled = await d.dashboard.forecastUntil(ctx, range.end);
    expect(scheduled.balanceCents).toBe(100_000);
    expect(scheduled.forecast.forecastCents).toBe(base - 10_000);

    await d.transactions.createTransfer(ctx, {
      fromAccountId: box,
      toAccountId: checking,
      amountCents: 4_000,
      occurredOn: LATER,
    });
    const both = await d.dashboard.forecastUntil(ctx, range.end);
    expect(both.forecast.forecastCents).toBe(base - 6_000);
  });

  it("lowers the Fluxo de caixa and says the caixinhas are left out", async () => {
    const { checking, box, ctx } = await withBox("fluxo");
    const range = rangeOf(ctx);
    const before = await d.reports.cashFlowReport(ctx, range);
    await d.transactions.createTransfer(ctx, {
      fromAccountId: checking,
      toAccountId: box,
      amountCents: 10_000,
      occurredOn: TODAY,
    });
    const after = await d.reports.cashFlowReport(ctx, range);
    expect(before.excludesSavingsBoxes).toBe(true);
    expect(after.endCents).toBe(before.endCents - 10_000);
  });

  it("does not say it without a caixinha", async () => {
    await person("sem-caixinha");
    await d.accounts.createAccount("sem-caixinha", {
      name: "Conta",
      type: "checking",
      initialBalanceCents: 1_000,
    });
    const ctx = await ctxOf("sem-caixinha");
    const report = await d.reports.cashFlowReport(ctx, rangeOf(ctx));
    expect(report.excludesSavingsBoxes).toBe(false);
    expect((await summaryOf("sem-caixinha")).savingsBoxCents).toBeNull();
  });
});

describe("direct entries on a caixinha", () => {
  it("count in the period totals and not in the Saldo", async () => {
    const { box, ctx } = await withBox("direto");
    const range = rangeOf(ctx);
    await d.transactions.createTransaction(ctx, {
      kind: "expense",
      amountCents: 2_500,
      accountId: box,
      categoryId: null,
      description: "Taxa",
      occurredOn: TODAY,
    });
    expect(
      await d.transactions.periodTotals(ctx, range.start, range.end),
    ).toMatchObject({ expenseCents: 2_500 });
    expect(await summaryOf("direto")).toMatchObject({
      balanceCents: 100_000,
      monthChangeCents: 0,
      savingsBoxCents: -2_500,
    });
  });
});

describe("without a spendable account", () => {
  it("has no Fluxo, no daily summary and no income countdown with only a caixinha and a card", async () => {
    await person("so-caixinha");
    const box = await d.accounts.createAccount("so-caixinha", {
      name: "Caixinha",
      type: "savings_box",
      initialBalanceCents: 50_000,
    });
    await d.accounts.createAccount("so-caixinha", {
      name: "Cartão",
      type: "credit_card",
      initialBalanceCents: 0,
      card: { limitCents: 100_000, closingDay: 17, dueDay: 25 },
    });
    const ctx = await ctxOf("so-caixinha");
    await d.transactions.createTransaction(ctx, {
      kind: "income",
      amountCents: 30_000,
      accountId: box,
      categoryId: null,
      description: "Rendimento",
      occurredOn: LATER,
    });
    expect(
      (await d.reports.cashFlowReport(ctx, rangeOf(ctx))).hasAccounts,
    ).toBe(false);
    expect(await d.reminders.loadDailySummary(ctx)).toMatchObject({
      hasLiquidAccount: false,
      balanceCents: 0,
    });
    expect(await d.reminders.loadIncomeCountdown(ctx)).toBeNull();
  });

  it("ignores an income scheduled in the caixinha when there is a spendable account", async () => {
    const { box, ctx } = await withBox("receita");
    await d.transactions.createTransaction(ctx, {
      kind: "income",
      amountCents: 30_000,
      accountId: box,
      categoryId: null,
      description: "Rendimento",
      occurredOn: LATER,
    });
    expect(await d.reminders.loadIncomeCountdown(ctx)).toBeNull();
    expect(await d.reminders.loadDailySummary(ctx)).toMatchObject({
      hasLiquidAccount: true,
      balanceCents: 100_000,
    });
  });
});

describe("which caixinhas count", () => {
  it("leaves out an archived one and one outside the net worth", async () => {
    const { box, ctx } = await withBox("conta");
    await d.accounts.adjustBalance(ctx, box, 20_000);
    expect((await summaryOf("conta")).savingsBoxCents).toBe(20_000);

    await d.accounts.updateAccount("conta", box, { includeInNetWorth: false });
    expect((await summaryOf("conta")).savingsBoxCents).toBeNull();

    await d.accounts.updateAccount("conta", box, { includeInNetWorth: true });
    await d.accounts.archiveAccount("conta", box);
    expect((await summaryOf("conta")).savingsBoxCents).toBeNull();
  });
});

describe("isolation", () => {
  it("does not let someone transfer into another person's caixinha", async () => {
    const { box } = await withBox("dona");
    await person("intruso");
    const mine = await d.accounts.createAccount("intruso", {
      name: "Conta",
      type: "checking",
      initialBalanceCents: 10_000,
    });
    const intruder = await ctxOf("intruso");
    await expect(
      d.transactions.createTransfer(intruder, {
        fromAccountId: mine,
        toAccountId: box,
        amountCents: 1_000,
        occurredOn: TODAY,
      }),
    ).rejects.toThrow();
    expect(await summaryOf("intruso")).toMatchObject({
      balanceCents: 10_000,
      savingsBoxCents: null,
    });
    const owned = (await d.accounts.listAccounts("dona")).find(
      (account) => account.id === box,
    );
    expect(owned?.balanceCents).toBe(0);
  });
});

describe("changing the type of an account", () => {
  it("moves a checking account to caixinha, with the icon following the type", async () => {
    await person("tipo-muda");
    const id = await d.accounts.createAccount("tipo-muda", {
      name: "Conta",
      type: "checking",
      initialBalanceCents: 1_000,
    });
    await d.accounts.updateAccount("tipo-muda", id, { type: "savings_box" });
    const [row] = await d.accounts.listAccounts("tipo-muda");
    expect(row).toMatchObject({ type: "savings_box", icon: "vault" });
    expect((await summaryOf("tipo-muda")).balanceCents).toBe(0);
  });

  it("keeps a custom icon", async () => {
    await person("icone");
    const id = await d.accounts.createAccount("icone", {
      name: "Conta",
      type: "checking",
      icon: "plane",
      initialBalanceCents: 0,
    });
    await d.accounts.updateAccount("icone", id, { type: "savings" });
    const [row] = await d.accounts.listAccounts("icone");
    expect(row).toMatchObject({ type: "savings", icon: "plane" });
  });

  it("refuses to turn a card into something else, or anything into a card", async () => {
    await person("cartao");
    const card = await d.accounts.createAccount("cartao", {
      name: "Cartão",
      type: "credit_card",
      initialBalanceCents: 0,
      card: { limitCents: 100_000, closingDay: 17, dueDay: 25 },
    });
    const checking = await d.accounts.createAccount("cartao", {
      name: "Conta",
      type: "checking",
      initialBalanceCents: 0,
    });
    await expect(
      d.accounts.updateAccount("cartao", card, { type: "checking" }),
    ).rejects.toThrow("cartão");
    await expect(
      d.accounts.updateAccount("cartao", checking, { type: "credit_card" }),
    ).rejects.toThrow("cartão");
  });

  it("does not touch another person's account", async () => {
    await person("alheia");
    const id = await d.accounts.createAccount("alheia", {
      name: "Conta",
      type: "checking",
      initialBalanceCents: 0,
    });
    await person("invasor");
    await expect(
      d.accounts.updateAccount("invasor", id, { type: "savings_box" }),
    ).rejects.toThrow();
    const [row] = await d.accounts.listAccounts("alheia");
    expect(row?.type).toBe("checking");
  });
});
