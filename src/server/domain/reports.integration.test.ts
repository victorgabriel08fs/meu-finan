// The report views of doc 02 §6.12 (Fluxo de caixa, Patrimônio, Calendário)
// against a real (in-memory) Postgres, on 14/out/2026 like the mockups.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  cards: typeof import("./cards");
  categories: typeof import("./categories");
  context: typeof import("./context");
  transactions: typeof import("./transactions");
  reports: typeof import("./reports");
};

let d: Domain;
let ctx: import("./context").UserContext;
const ids = {} as Record<
  | "checking"
  | "reserve"
  | "wallet"
  | "card"
  | "business"
  | "groceries"
  | "housing"
  | "utilities"
  | "transport"
  | "salary"
  | "freelance",
  string
>;

// 14/out/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { db } = await import("../db/client");
  await migrate(db as never, { migrationsFolder: "drizzle" });
  const schema = await import("../db/schema");
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  await db.insert(schema.user).values([
    { id: "owner", name: "Ana", email: "ana@exemplo.com" },
    { id: "other", name: "Bia", email: "bia@exemplo.com" },
  ]);
  await ensureOwnerDefaults("owner");

  d = {
    accounts: await import("./accounts"),
    cards: await import("./cards"),
    categories: await import("./categories"),
    context: await import("./context"),
    transactions: await import("./transactions"),
    reports: await import("./reports"),
  };
  ctx = await d.context.getUserContext("owner", { now: NOW });

  const create = d.accounts.createAccount;
  ids.checking = await create("owner", {
    name: "Conta principal",
    type: "checking",
    initialBalanceCents: 0,
  });
  ids.reserve = await create("owner", {
    name: "Reserva",
    type: "investment",
    initialBalanceCents: 0,
  });
  ids.wallet = await create("owner", {
    name: "Carteira",
    type: "cash",
    initialBalanceCents: 15_000,
  });
  ids.card = await create("owner", {
    name: "Cartão Principal",
    type: "credit_card",
    initialBalanceCents: 0,
    card: { limitCents: 550_000, closingDay: 17, dueDay: 25 },
  });
  ids.business = await create("owner", {
    name: "Conta da empresa",
    type: "checking",
    initialBalanceCents: 0,
    includeInNetWorth: false,
  });

  const all = await d.categories.listCategories("owner");
  const find = (name: string) => {
    const found = all.find((category) => category.name === name);
    if (!found) throw new Error(`categoria ${name}`);
    return found.id;
  };
  ids.groceries = find("Mercado");
  ids.housing = find("Moradia");
  ids.utilities = find("Contas da casa");
  ids.transport = find("Transporte");
  ids.salary = find("Salário");
  ids.freelance = find("Freelance");

  const t = d.transactions;
  const expense = (
    accountId: string,
    categoryId: string,
    description: string,
    amountCents: number,
    occurredOn: string,
    extra: { paid?: boolean; recurrence?: { freq: "monthly" } } = {},
  ) =>
    t.createTransaction(ctx, {
      kind: "expense",
      amountCents,
      accountId,
      categoryId,
      description,
      occurredOn,
      ...extra,
    });
  const income = (description: string, amountCents: number, on: string) =>
    t.createTransaction(ctx, {
      kind: "income",
      amountCents,
      accountId: ids.checking,
      categoryId: description === "Salário" ? ids.salary : ids.freelance,
      description,
      occurredOn: on,
    });

  // September, all paid.
  await income("Salário", 780_000, "2026-09-05");
  await expense(ids.checking, ids.housing, "Aluguel", 210_000, "2026-09-15");
  // Closes on 17/out, due on 25/out.
  await expense(ids.card, ids.groceries, "Atacadão", 30_000, "2026-09-20");
  // October up to today.
  await income("Salário", 780_000, "2026-10-07");
  await t.createTransfer(ctx, {
    fromAccountId: ids.checking,
    toAccountId: ids.reserve,
    amountCents: 100_000,
    occurredOn: "2026-10-07",
  });
  await expense(
    ids.checking,
    ids.groceries,
    "Supermercado",
    6_450,
    "2026-10-14",
  );
  await expense(ids.card, ids.transport, "Corrida", 2_290, "2026-10-14");
  // Not marked as paid yet: overdue.
  await expense(
    ids.checking,
    ids.utilities,
    "Conta de luz",
    15_000,
    "2026-10-10",
    { paid: false },
  );
  // Scheduled.
  await expense(ids.checking, ids.housing, "Aluguel", 210_000, "2026-10-15", {
    recurrence: { freq: "monthly" },
  });
  await income("Freelance", 65_000, "2026-10-28");
  // Between two liquid accounts: nets out.
  await t.createTransfer(ctx, {
    fromAccountId: ids.checking,
    toAccountId: ids.reserve,
    amountCents: 50_000,
    occurredOn: "2026-10-20",
  });
  // To an account outside the net worth: money leaves.
  await t.createTransfer(ctx, {
    fromAccountId: ids.checking,
    toAccountId: ids.business,
    amountCents: 10_000,
    occurredOn: "2026-10-21",
  });
  // Paying October's invoice ahead of its due date: the invoice counts once.
  const october = (await d.cards.listInvoices(ctx, ids.card)).find(
    (invoice) => invoice.referenceMonth === "2026-10",
  );
  if (!october) throw new Error("fatura de outubro");
  await d.cards.payInvoice(ctx, {
    invoiceId: october.id,
    fromAccountId: ids.checking,
    amountCents: 32_290,
    occurredOn: "2026-10-24",
  });
}, 120_000);

// Liquid balance today: checking 1.243.550 + reserve 100.000 + wallet 15.000.
const BALANCE = 1_358_550;

describe("cashFlowReport (Fluxo de caixa)", () => {
  it("realizes October up to today and projects the rest", async () => {
    const range = d.context.resolvePeriod(ctx, "2026-10");
    const report = await d.reports.cashFlowReport(ctx, range);
    expect(report.phase).toBe("current");
    expect(report.hasAccounts).toBe(true);
    expect(report.days).toHaveLength(31);
    const day = (date: string) =>
      report.days.find((item) => item.date === date);

    expect(report.startCents).toBe(585_000);
    expect(day("2026-10-06")).toEqual({
      date: "2026-10-06",
      realizedCents: 585_000,
      projectedCents: null,
    });
    expect(day("2026-10-07")?.realizedCents).toBe(1_365_000);
    // Today: the Início balance; the overdue electricity bill lands today.
    expect(day("2026-10-14")).toEqual({
      date: "2026-10-14",
      realizedCents: BALANCE,
      projectedCents: BALANCE - 15_000,
    });
    expect(day("2026-10-15")?.projectedCents).toBe(BALANCE - 225_000);
    expect(day("2026-10-21")?.projectedCents).toBe(BALANCE - 235_000);
    expect(day("2026-10-25")?.projectedCents).toBe(BALANCE - 267_290);
    expect(report.endCents).toBe(BALANCE - 202_290);
    expect(report.lowestProjected).toEqual({
      date: "2026-10-25",
      cents: BALANCE - 267_290,
    });
    expect(report.lowestRealized).toEqual({
      date: "2026-10-01",
      cents: 585_000,
    });
    expect(report.paidCount).toBe(4);
  });

  it("names what moves the projection, once each", async () => {
    const range = d.context.resolvePeriod(ctx, "2026-10");
    const report = await d.reports.cashFlowReport(ctx, range);
    expect(
      report.scheduled.map((item) => [
        item.date,
        item.label,
        item.amountCents,
        item.kind,
        item.overdue,
      ]),
    ).toEqual([
      ["2026-10-14", "Conta de luz", -15_000, "entry", true],
      ["2026-10-15", "Aluguel", -210_000, "entry", false],
      ["2026-10-21", "Para Conta da empresa", -10_000, "entry", false],
      ["2026-10-25", "Fatura Cartão Principal", -32_290, "invoice", false],
      ["2026-10-28", "Freelance", 65_000, "entry", false],
    ]);
  });

  it("starts November where October is projected to end", async () => {
    const range = d.context.resolvePeriod(ctx, "2026-11");
    const report = await d.reports.cashFlowReport(ctx, range);
    expect(report.phase).toBe("future");
    expect(report.days).toHaveLength(30);
    expect(report.days.every((day) => day.realizedCents === null)).toBe(true);
    expect(report.startCents).toBe(BALANCE - 202_290);
    expect(report.endCents).toBe(BALANCE - 412_290);
    expect(report.lowestProjected).toEqual({
      date: "2026-11-15",
      cents: BALANCE - 412_290,
    });
    expect(report.scheduled.map((item) => item.label)).toEqual(["Aluguel"]);
    expect(report.paidCount).toBe(0);
  });

  it("is fully realized for September", async () => {
    const range = d.context.resolvePeriod(ctx, "2026-09");
    const report = await d.reports.cashFlowReport(ctx, range);
    expect(report.phase).toBe("past");
    expect(report.startCents).toBe(15_000);
    expect(report.days.find((day) => day.date === "2026-09-05")).toEqual({
      date: "2026-09-05",
      realizedCents: 795_000,
      projectedCents: null,
    });
    expect(report.endCents).toBe(585_000);
    expect(report.lowestProjected).toBeNull();
    expect(report.lowestRealized).toEqual({
      date: "2026-09-01",
      cents: 15_000,
    });
    expect(report.scheduled).toEqual([]);
    expect(report.paidCount).toBe(2);
  });

  it("follows the financial month of the user", async () => {
    const fifth = { ...ctx, monthStartDay: 5 };
    const range = d.context.resolvePeriod(fifth, "2026-09");
    expect(range).toMatchObject({ start: "2026-09-05", end: "2026-10-04" });
    const report = await d.reports.cashFlowReport(fifth, range);
    expect(report.startCents).toBe(15_000);
    expect(report.days[0]).toMatchObject({ realizedCents: 795_000 });
    expect(report.endCents).toBe(585_000);
  });

  it("shows nothing to someone else", async () => {
    const other = await d.context.getUserContext("other", { now: NOW });
    const range = d.context.resolvePeriod(other, "2026-10");
    const report = await d.reports.cashFlowReport(other, range);
    expect(report).toMatchObject({
      hasAccounts: false,
      days: [],
      scheduled: [],
    });
    const spending = await d.reports.dailySpending(other, range);
    expect(spending.every((day) => day.paidCents === 0)).toBe(true);
    const worth = await d.reports.netWorthBreakdown(other, range, 2);
    expect(worth.every((point) => point.netCents === 0)).toBe(true);
  });
});

describe("liquidPendingFlows", () => {
  it("judges a pending transfer by its other leg", () => {
    const row = (
      id: string,
      accountId: string,
      accountType: string,
      amountCents: number,
      transferId: string | null = null,
    ) => ({
      id,
      accountId,
      accountType,
      amountCents,
      occurredOn: "2026-10-20",
      transferId,
    });
    const flows = d.reports.liquidPendingFlows(
      [
        row("expense", "a", "checking", -5_000),
        row("card purchase", "card", "credit_card", -3_000),
        row("to savings", "a", "checking", -10_000, "t1"),
        row("from checking", "b", "savings", 10_000, "t1"),
        row("invoice payment", "a", "checking", -20_000, "t2"),
        row("card leg", "card", "credit_card", 20_000, "t2"),
        row("to an outside account", "a", "checking", -7_000, "t3"),
        row("outside leg", "x", "checking", 7_000, "t3"),
        row("lone leg", "b", "savings", 1_000, "t4"),
      ],
      new Set(["a", "b"]),
    );
    expect(
      flows.map(({ row, entry }) => [
        row.id,
        entry.amountCents,
        entry.paysInvoice,
      ]),
    ).toEqual([
      ["expense", -5_000, false],
      ["invoice payment", -20_000, true],
      ["to an outside account", -7_000, false],
      ["lone leg", 1_000, false],
    ]);
  });
});

describe("netWorthBreakdown (Patrimônio)", () => {
  it("splits each month into assets and liabilities", async () => {
    const range = d.context.resolvePeriod(ctx, "2026-10");
    const points = await d.reports.netWorthBreakdown(ctx, range, 3);
    expect(points).toEqual([
      {
        month: "2026-08",
        netCents: 15_000,
        assetsCents: 15_000,
        liabilitiesCents: 0,
      },
      {
        month: "2026-09",
        netCents: 555_000,
        assetsCents: 585_000,
        liabilitiesCents: 30_000,
      },
      {
        month: "2026-10",
        netCents: BALANCE - 32_290,
        assetsCents: BALANCE,
        liabilitiesCents: 32_290,
      },
    ]);
  });

  it("agrees with the net worth series of Visão geral", async () => {
    const range = d.context.resolvePeriod(ctx, "2026-10");
    const [breakdown, series] = await Promise.all([
      d.reports.netWorthBreakdown(ctx, range, 13),
      d.reports.netWorthSeries(ctx, range, 13),
    ]);
    expect(breakdown.map((point) => [point.month, point.netCents])).toEqual(
      series.map((point) => [point.month, point.cents]),
    );
  });
});

describe("dailySpending (Calendário)", () => {
  it("adds up each day's expenses, paid and scheduled apart", async () => {
    const range = d.context.resolvePeriod(ctx, "2026-10");
    const days = await d.reports.dailySpending(ctx, range);
    expect(days).toHaveLength(31);
    expect(days[0]?.date).toBe("2026-10-01");
    const byDate = new Map(days.map((day) => [day.date, day]));
    expect(byDate.get("2026-10-14")).toEqual({
      date: "2026-10-14",
      paidCents: 8_740,
      paidCount: 2,
      pendingCents: 0,
      pendingCount: 0,
    });
    expect(byDate.get("2026-10-10")).toMatchObject({
      paidCents: 0,
      pendingCents: 15_000,
      pendingCount: 1,
    });
    expect(byDate.get("2026-10-15")?.pendingCents).toBe(210_000);
    // Transfers and the invoice payment are not spending.
    expect(byDate.get("2026-10-07")?.paidCents).toBe(0);
    expect(byDate.get("2026-10-24")?.pendingCents).toBe(0);
    expect(days.reduce((sum, day) => sum + day.paidCents, 0)).toBe(8_740);
  });

  it("lists one day's expenses for the day sheet", async () => {
    const { items } = await d.transactions.listTransactions(ctx, {
      start: "2026-10-14",
      end: "2026-10-14",
      kind: "expense",
    });
    expect(items.map((item) => item.description).sort()).toEqual([
      "Corrida",
      "Supermercado",
    ]);
  });
});
