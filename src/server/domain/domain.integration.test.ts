// The domain layer against a real (in-memory) Postgres: balances, invoices,
// installments, transfers, recurrences, budgets, dashboard and reports, using
// the scenario of the mockups (doc 02, 14/out/2026).
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  cards: typeof import("./cards");
  categories: typeof import("./categories");
  context: typeof import("./context");
  transactions: typeof import("./transactions");
  budgets: typeof import("./budgets");
  dashboard: typeof import("./dashboard");
  reports: typeof import("./reports");
};

let d: Domain;
let ctx: import("./context").UserContext;
const ids = {} as Record<
  | "checking"
  | "reserve"
  | "wallet"
  | "card"
  | "groceries"
  | "transport"
  | "shopping"
  | "housing"
  | "salary",
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
  await db
    .insert(schema.user)
    .values({ id: "owner", name: "Ana", email: "ana@exemplo.com" });
  await ensureOwnerDefaults("owner");

  d = {
    accounts: await import("./accounts"),
    cards: await import("./cards"),
    categories: await import("./categories"),
    context: await import("./context"),
    transactions: await import("./transactions"),
    budgets: await import("./budgets"),
    dashboard: await import("./dashboard"),
    reports: await import("./reports"),
  };
  ctx = await d.context.getUserContext("owner", { now: NOW });

  ids.checking = await d.accounts.createAccount("owner", {
    name: "Conta principal",
    type: "checking",
    initialBalanceCents: 0,
  });
  ids.reserve = await d.accounts.createAccount("owner", {
    name: "Reserva",
    type: "investment",
    initialBalanceCents: 0,
  });
  ids.wallet = await d.accounts.createAccount("owner", {
    name: "Carteira",
    type: "cash",
    initialBalanceCents: 15_000,
  });
  ids.card = await d.accounts.createAccount("owner", {
    name: "Cartão Principal",
    type: "credit_card",
    initialBalanceCents: 0,
    card: { limitCents: 550_000, closingDay: 17, dueDay: 25 },
  });

  const all = await d.categories.listCategories("owner");
  const find = (name: string) => {
    const found = all.find((category) => category.name === name);
    if (!found) throw new Error(`categoria ${name}`);
    return found.id;
  };
  ids.groceries = find("Mercado");
  ids.transport = find("Transporte");
  ids.shopping = find("Compras");
  ids.housing = find("Moradia");
  ids.salary = find("Salário");
}, 120_000);

describe("ledger", () => {
  it("records the month and keeps balances derived from the ledger", async () => {
    const t = d.transactions;
    await t.createTransaction(ctx, {
      kind: "income",
      amountCents: 780_000,
      accountId: ids.checking,
      categoryId: ids.salary,
      description: "Salário",
      occurredOn: "2026-10-07",
    });
    await t.createTransfer(ctx, {
      fromAccountId: ids.checking,
      toAccountId: ids.reserve,
      amountCents: 100_000,
      occurredOn: "2026-10-07",
    });
    await t.createTransaction(ctx, {
      kind: "expense",
      amountCents: 6_450,
      accountId: ids.checking,
      categoryId: ids.groceries,
      description: "Supermercado",
      occurredOn: "2026-10-14",
    });
    await t.createTransaction(ctx, {
      kind: "expense",
      amountCents: 2_290,
      accountId: ids.card,
      categoryId: ids.transport,
      description: "Corrida por app",
      occurredOn: "2026-10-14",
    });
    // Tênis em 6x, comprado em 3/set: parcela 1 na fatura de set, 2 na de out...
    const tenis = await t.createTransaction(ctx, {
      kind: "expense",
      amountCents: 59_988,
      accountId: ids.card,
      categoryId: ids.shopping,
      description: "Tênis de corrida",
      occurredOn: "2026-09-03",
      installments: 6,
    });
    expect(tenis.ids).toHaveLength(6);
    // Aluguel todo dia 15, a partir de amanhã.
    const rent = await t.createTransaction(ctx, {
      kind: "expense",
      amountCents: 210_000,
      accountId: ids.checking,
      categoryId: ids.housing,
      description: "Aluguel",
      occurredOn: "2026-10-15",
      recurrence: { freq: "monthly" },
    });
    // Horizon: today + 60 days = 13/dez → 15/out and 15/nov.
    expect(rent.ids).toHaveLength(2);

    const accounts = await d.accounts.listAccounts("owner");
    const byId = new Map(accounts.map((account) => [account.id, account]));
    expect(byId.get(ids.checking)?.balanceCents).toBe(
      780_000 - 100_000 - 6_450,
    );
    expect(byId.get(ids.checking)?.pendingCents).toBe(-420_000);
    expect(byId.get(ids.reserve)?.balanceCents).toBe(100_000);
    expect(byId.get(ids.wallet)?.balanceCents).toBe(15_000);
    // Card: purchase of today + installments 1 and 2 are paid; 3–6 are future.
    expect(byId.get(ids.card)?.balanceCents).toBe(-(2_290 + 9_998 + 9_998));
    expect(byId.get(ids.card)?.pendingCents).toBe(-4 * 9_998);
  });

  it("is idempotent for a client-generated id", async () => {
    const id = "01900000-0000-7000-8000-00000000abcd";
    const input = {
      id,
      kind: "expense" as const,
      amountCents: 1_000,
      accountId: ids.wallet,
      categoryId: ids.groceries,
      occurredOn: "2026-10-14",
    };
    await d.transactions.createTransaction(ctx, input);
    await d.transactions.createTransaction(ctx, input);
    const { items } = await d.transactions.listTransactions(ctx, {
      start: "2026-10-14",
      end: "2026-10-14",
      accountId: ids.wallet,
    });
    expect(items.filter((item) => item.id === id)).toHaveLength(1);
    await d.transactions.deleteTransaction(ctx, id);
  });

  it("replays installments and transfers by client id without duplicating", async () => {
    const t = d.transactions;
    const purchase = {
      id: "01900000-0000-7000-8000-00000000beef",
      kind: "expense" as const,
      amountCents: 30_000,
      accountId: ids.wallet,
      categoryId: ids.shopping,
      occurredOn: "2026-10-14",
      installments: 3,
    };
    const first = await t.createTransaction(ctx, purchase);
    const replay = await t.createTransaction(ctx, purchase);
    expect(first.ids).toHaveLength(3);
    expect([...replay.ids].sort()).toEqual([...first.ids].sort());

    const transfer = {
      id: "01900000-0000-7000-8000-00000000cafe",
      fromAccountId: ids.wallet,
      toAccountId: ids.reserve,
      amountCents: 500,
      occurredOn: "2026-10-14",
    };
    const sent = await t.createTransfer(ctx, transfer);
    expect(await t.createTransfer(ctx, transfer)).toEqual(sent);

    await t.deleteTransaction(ctx, purchase.id, "all");
    expect(await t.deleteTransaction(ctx, transfer.id)).toHaveLength(2);
    const accounts = await d.accounts.listAccounts("owner");
    expect(
      accounts.find((account) => account.id === ids.wallet)?.balanceCents,
    ).toBe(15_000);
  });

  it("builds the card invoices from the purchases", async () => {
    const overview = await d.cards.getCardOverview(ctx, ids.card);
    const byMonth = new Map(
      overview.invoices.map((invoice) => [invoice.referenceMonth, invoice]),
    );
    expect([...byMonth.keys()]).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(byMonth.get("2026-09")?.totalCents).toBe(9_998);
    expect(byMonth.get("2026-09")?.status).toBe("overdue");
    expect(byMonth.get("2026-10")).toMatchObject({
      totalCents: 2_290 + 9_998,
      closingDate: "2026-10-17",
      dueDate: "2026-10-25",
      status: "open",
    });
    expect(overview.currentReferenceMonth).toBe("2026-10");
    expect(overview.usedCents).toBe(2_290 + 2 * 9_998 + 4 * 9_998);
    expect(overview.availableCents).toBe(550_000 - overview.usedCents);

    // Paying September's invoice (late, but paid today) settles it.
    const september = byMonth.get("2026-09");
    if (!september) throw new Error("fatura de setembro");
    await d.cards.payInvoice(ctx, {
      invoiceId: september.id,
      fromAccountId: ids.checking,
      amountCents: 9_998,
      occurredOn: "2026-10-14",
    });
    const after = await d.cards.listInvoices(ctx, ids.card);
    expect(
      after.find((invoice) => invoice.referenceMonth === "2026-09"),
    ).toMatchObject({
      paidCents: 9_998,
      outstandingCents: 0,
      status: "paid",
    });
  });

  it("totals the period, transfers excluded", async () => {
    const totals = await d.transactions.periodTotals(
      ctx,
      "2026-10-01",
      "2026-10-31",
    );
    expect(totals).toEqual({
      incomeCents: 780_000,
      expenseCents: 6_450 + 2_290 + 9_998,
      pendingIncomeCents: 0,
      pendingExpenseCents: 210_000,
    });
  });

  it("lists a transfer once and finds descriptions without accents or case", async () => {
    const { items } = await d.transactions.listTransactions(ctx, {
      start: "2026-10-01",
      end: "2026-10-31",
    });
    const transfers = items.filter((item) => item.kind === "transfer");
    expect(transfers.map((item) => item.amountCents)).toEqual([
      -9_998, -100_000,
    ]);
    expect(
      transfers.find((item) => item.amountCents === -100_000)?.counterpartName,
    ).toBe("Reserva");
    const found = await d.transactions.listTransactions(ctx, {
      start: "2026-10-01",
      end: "2026-10-31",
      q: "MERCADO",
    });
    expect(found.items.map((item) => item.description)).toEqual([
      "Supermercado",
    ]);
    const installment = items.find(
      (item) => item.description === "Tênis de corrida",
    );
    expect(installment?.installment).toEqual({
      number: 2,
      count: 6,
      totalCents: 59_988,
    });
    expect(installment?.recurrence).toBeNull();
    const rent = items.find((item) => item.description === "Aluguel");
    expect(rent?.recurrence).toEqual({
      freq: "monthly",
      interval: 1,
      byMonthDay: 15,
      endOn: null,
    });
  });

  it("deletes a transfer with both legs and restores it", async () => {
    const { items } = await d.transactions.listTransactions(ctx, {
      start: "2026-10-07",
      end: "2026-10-07",
      kind: "transfer",
    });
    const transfer = items[0];
    if (!transfer) throw new Error("transferência");
    const deleted = await d.transactions.deleteTransaction(ctx, transfer.id);
    expect(deleted).toHaveLength(2);
    await d.transactions.restoreTransactions(ctx, deleted);
    const accounts = await d.accounts.listAccounts("owner");
    expect(
      accounts.find((account) => account.id === ids.reserve)?.balanceCents,
    ).toBe(100_000);
  });
});

describe("planning and overview", () => {
  it("computes budget pace for the month", async () => {
    await d.budgets.upsertBudget(ctx, {
      categoryId: ids.groceries,
      month: "2026-10",
      amountCents: 90_000,
    });
    await d.budgets.upsertBudget(ctx, {
      categoryId: ids.housing,
      month: "2026-10",
      amountCents: 210_000,
    });
    const range = d.context.resolvePeriod(ctx, "2026-10");
    const { items, total } = await d.budgets.getBudgets(ctx, range);
    const groceries = items.find((item) => item.categoryId === ids.groceries);
    expect(groceries).toMatchObject({ spentCents: 6_450, scheduledCents: 0 });
    expect(groceries?.pace.status).toBe("on_track");
    const housing = items.find((item) => item.categoryId === ids.housing);
    expect(housing?.pace.status).toBe("scheduled");
    expect(total?.budgetCents).toBe(300_000);
    expect(total?.pace.remainingDays).toBe(18);
    expect(await d.budgets.copyBudgetsFromPreviousMonth(ctx, "2026-11")).toBe(
      2,
    );
  });

  it("creates several budgets at once, or none", async () => {
    const range = d.context.resolvePeriod(ctx, "2026-12");
    await expect(
      d.budgets.upsertBudgets(ctx, "2026-12", [
        { categoryId: ids.groceries, amountCents: 50_000 },
        // An income category cannot have a budget: the whole batch fails.
        { categoryId: ids.salary, amountCents: 10_000 },
      ]),
    ).rejects.toThrow();
    expect((await d.budgets.getBudgets(ctx, range)).items).toHaveLength(0);
    expect(
      await d.budgets.upsertBudgets(ctx, "2026-12", [
        { categoryId: ids.groceries, amountCents: 50_000 },
        { categoryId: ids.transport, amountCents: 20_000 },
      ]),
    ).toBe(2);
    expect((await d.budgets.getBudgets(ctx, range)).items).toHaveLength(2);
  });

  it("assembles the dashboard", async () => {
    const range = d.context.resolvePeriod(ctx, null);
    expect(range).toMatchObject({
      month: "2026-10",
      start: "2026-10-01",
      end: "2026-10-31",
    });
    const [summary, upcoming, strip, totals] = await Promise.all([
      d.dashboard.getBalanceSummary(ctx, range),
      d.dashboard.getUpcoming(ctx),
      d.dashboard.getAccountsStrip(ctx),
      d.transactions.periodTotals(ctx, range.start, range.end),
    ]);
    const checking = 780_000 - 100_000 - 6_450 - 9_998;
    expect(summary.balanceCents).toBe(checking + 100_000 + 15_000);
    // Rent (pending) and October's invoice are due by 31/out.
    expect(summary.forecast.forecastCents).toBe(
      checking + 100_000 + 15_000 - 210_000 - (2_290 + 9_998),
    );
    expect(upcoming.map((item) => item.title)).toEqual(["Aluguel"]);
    expect(totals.incomeCents).toBe(780_000);
    expect(strip.accounts.map((account) => account.id).sort()).toEqual(
      [ids.checking, ids.reserve, ids.wallet, ids.card].sort(),
    );
    expect(await d.dashboard.accountsOf(ctx)).toEqual(strip.accounts);
    // October's invoice: today's ride and the 2nd installment of the shoes.
    expect(strip.currentInvoiceCents).toEqual({
      [ids.card]: 2_290 + 9_998,
    });

    // A scheduled transfer between two liquid accounts does not move the
    // forecast (it used to count its incoming leg as income).
    const { transferId } = await d.transactions.createTransfer(ctx, {
      fromAccountId: ids.checking,
      toAccountId: ids.reserve,
      amountCents: 50_000,
      occurredOn: "2026-10-20",
    });
    const withTransfer = await d.dashboard.getBalanceSummary(ctx, range);
    expect(withTransfer.forecast.forecastCents).toBe(
      summary.forecast.forecastCents,
    );
    const { items } = await d.transactions.listTransactions(ctx, {
      start: "2026-10-20",
      end: "2026-10-20",
      kind: "transfer",
    });
    const leg = items.find((item) => item.transferId === transferId);
    if (!leg) throw new Error("transferência agendada");
    await d.transactions.deleteTransaction(ctx, leg.id);
  });

  it("counts the próximas contas 7 days from today, across the month", async () => {
    // 30/out, the day before the last of the month: a bill on 2/nov is due
    // in 3 days, although it falls in the next period.
    const late = await d.context.getUserContext("owner", {
      now: Date.UTC(2026, 9, 30, 15, 0, 0),
    });
    const october = d.context.resolvePeriod(late, null);
    const september = d.context.resolvePeriod(late, "2026-09");
    expect(october.end).toBe("2026-10-31");
    const before = await d.dashboard.getBalanceSummary(late, october);

    const light = await d.transactions.createTransaction(late, {
      kind: "expense",
      amountCents: 18_700,
      accountId: ids.checking,
      categoryId: ids.housing,
      description: "Conta de luz",
      occurredOn: "2026-11-02",
    });
    // A week and a day away: not yet.
    const water = await d.transactions.createTransaction(late, {
      kind: "expense",
      amountCents: 9_100,
      accountId: ids.checking,
      categoryId: ids.housing,
      description: "Conta de água",
      occurredOn: "2026-11-07",
    });

    const upcoming = await d.dashboard.getUpcoming(late);
    const titles = upcoming.map((item) => item.title);
    expect(titles).toContain("Conta de luz");
    expect(titles).not.toContain("Conta de água");
    expect(
      upcoming.find((item) => item.title === "Conta de luz"),
    ).toMatchObject({
      dueOn: "2026-11-02",
      amountCents: 18_700,
      overdue: false,
    });
    // The forecast still stops at the end of the period shown: a past month
    // (?mes=2026-09) or this one leaves November's bill out.
    const after = await d.dashboard.getBalanceSummary(late, october);
    expect(after.forecast.forecastCents).toBe(before.forecast.forecastCents);
    const past = await d.dashboard.getBalanceSummary(late, september);
    expect(past.forecast.forecastCents).toBe(past.balanceCents);

    for (const id of [...light.ids, ...water.ids]) {
      await d.transactions.deleteTransaction(late, id);
    }
  });

  it("builds the monthly series and the net worth", async () => {
    const range = d.context.resolvePeriod(ctx, null);
    const series = await d.reports.monthlySeries(ctx, range, 3);
    expect(
      series.map((point) => [
        point.month,
        point.incomeCents,
        point.expenseCents,
        point.partial,
      ]),
    ).toEqual([
      ["2026-08", 0, 0, false],
      ["2026-09", 0, 9_998, false],
      ["2026-10", 780_000, 6_450 + 2_290 + 9_998, true],
    ]);
    const netWorth = await d.reports.netWorthSeries(ctx, range, 2);
    const checking = 780_000 - 100_000 - 6_450 - 9_998;
    const card = -(2_290 + 9_998 + 9_998) + 9_998;
    expect(netWorth.at(-1)?.cents).toBe(checking + 100_000 + 15_000 + card);
    const breakdown = await d.reports.categoryBreakdown(
      ctx,
      "2026-10-01",
      "2026-10-31",
    );
    expect(breakdown.items.map((item) => item.name)).toEqual([
      "Compras",
      "Mercado",
      "Transporte",
    ]);
  });
});

describe("recurrences", () => {
  it("extends active rules 60 days ahead, idempotently", async () => {
    const { materializeRecurrences } = await import("./recurrences");
    // 40 days later the horizon is 22/jan/2027: rent of 15/dez and 15/jan appear.
    const later = NOW + 40 * 86_400_000;
    const first = await materializeRecurrences({ now: later });
    expect(first).toEqual({ recurrences: 1, created: 2 });
    const again = await materializeRecurrences({ now: later });
    expect(again.created).toBe(0);
    const { items } = await d.transactions.listTransactions(ctx, {
      start: "2026-12-01",
      end: "2027-01-31",
      accountId: ids.checking,
    });
    expect(
      items.map((item) => [item.description, item.occurredOn, item.status]),
    ).toEqual([
      ["Aluguel", "2027-01-15", "pending"],
      ["Aluguel", "2026-12-15", "pending"],
    ]);
  });
});

describe("series edits", () => {
  async function rent() {
    const { items } = await d.transactions.listTransactions(ctx, {
      start: "2026-10-01",
      end: "2027-03-31",
      accountId: ids.checking,
      categoryIds: [ids.housing],
    });
    return items.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  }

  it("splits a recurrence for this and the next occurrences", async () => {
    const december = (await rent()).find(
      (item) => item.occurredOn === "2026-12-15",
    );
    if (!december) throw new Error("aluguel de dezembro");
    await d.transactions.updateTransaction(
      ctx,
      december.id,
      { amountCents: 225_000 },
      "future",
    );
    const after = await rent();
    expect(after.map((item) => [item.occurredOn, item.amountCents])).toEqual([
      ["2026-10-15", -210_000],
      ["2026-11-15", -210_000],
      ["2026-12-15", -225_000],
      ["2027-01-15", -225_000],
    ]);
    expect(after[0]?.recurrence?.endOn).toBe("2026-12-14");
    expect(after[2]?.recurrence?.endOn).toBeNull();

    // The new rule keeps materialising with the new amount; the old one stops.
    const { materializeRecurrences } = await import("./recurrences");
    const report = await materializeRecurrences({
      now: NOW + 70 * 86_400_000,
    });
    expect(report).toEqual({ recurrences: 1, created: 1 });
    expect((await rent()).at(-1)).toMatchObject({
      occurredOn: "2027-02-15",
      amountCents: -225_000,
    });
  });

  it("renames every installment and refuses changes it cannot spread", async () => {
    const t = d.transactions;
    const { items } = await t.listTransactions(ctx, {
      start: "2026-09-01",
      end: "2027-03-31",
      accountId: ids.card,
      categoryIds: [ids.shopping],
    });
    const first = items.find((item) => item.installment?.number === 1);
    if (!first) throw new Error("primeira parcela");
    await t.updateTransaction(
      ctx,
      first.id,
      { description: "Tênis de trilha", categoryId: ids.transport },
      "all",
    );
    const renamed = await t.listTransactions(ctx, {
      start: "2026-09-01",
      end: "2027-03-31",
      accountId: ids.card,
      q: "trilha",
    });
    expect(renamed.items).toHaveLength(6);
    expect(
      renamed.items.every((item) => item.categoryId === ids.transport),
    ).toBe(true);

    await expect(
      t.updateTransaction(ctx, first.id, { amountCents: 1_000 }, "all"),
    ).rejects.toThrow("exclua a compra");
    await expect(
      t.updateTransaction(
        ctx,
        first.id,
        { occurredOn: "2026-09-04" },
        "future",
      ),
    ).rejects.toThrow("altere só este");
  });
});

describe("another account's category", () => {
  it("never lands on an entry of a second account, balance adjustments included", async () => {
    const { db } = await import("../db/client");
    const schema = await import("../db/schema");
    const { ensureOwnerDefaults } = await import("../db/seed-defaults");
    await db
      .insert(schema.user)
      .values({ id: "other", name: "Bruno", email: "bruno@exemplo.com" });
    await ensureOwnerDefaults("other");
    const other = await d.context.getUserContext("other", { now: NOW });
    const wallet = await d.accounts.createAccount("other", {
      name: "Carteira",
      type: "cash",
      initialBalanceCents: 10_000,
    });
    expect(await d.accounts.adjustBalance(other, wallet, 12_000)).toBe(2_000);
    const { items } = await d.transactions.listTransactions(other, {
      start: other.todayIso,
      end: other.todayIso,
      accountId: wallet,
      kind: "adjustment",
    });
    const adjustment = items[0];
    if (!adjustment) throw new Error("ajuste de saldo");

    // Ana's "Mercado", sent by hand to the edit action: an adjustment keeps
    // no category, so its statement row shows none of hers.
    await d.transactions.updateTransaction(
      other,
      adjustment.id,
      { categoryId: ids.groceries },
      "this",
    );
    expect(
      await d.transactions.getTransaction(other, adjustment.id),
    ).toMatchObject({
      categoryId: null,
      categoryName: null,
      amountCents: 2_000,
    });

    // Any other entry refuses it outright.
    const { ids: created } = await d.transactions.createTransaction(other, {
      kind: "expense",
      amountCents: 1_000,
      accountId: wallet,
      categoryId: null,
      occurredOn: other.todayIso,
    });
    const [expense] = created;
    if (!expense) throw new Error("despesa");
    await expect(
      d.transactions.updateTransaction(other, expense, {
        categoryId: ids.groceries,
      }),
    ).rejects.toThrow("Categoria não encontrad");
  });
});

describe("statement filters", () => {
  it("brings a parent category's subcategories, only on the given ids", async () => {
    const { db } = await import("../db/client");
    const schema = await import("../db/schema");
    const [market] = await db
      .insert(schema.categories)
      .values({
        userId: "owner",
        parentId: ids.groceries,
        kind: "expense",
        name: "Feira",
        icon: "carrot",
        color: "cat-1",
      })
      .returning({ id: schema.categories.id });
    if (!market) throw new Error("subcategoria");

    const t = d.transactions;
    const august = { start: "2026-08-01", end: "2026-08-31" };
    for (const [categoryId, accountId, description, occurredOn] of [
      [ids.groceries, ids.wallet, "Supermercado", "2026-08-10"],
      [market.id, ids.checking, "Feira de sábado", "2026-08-11"],
      [ids.transport, ids.checking, "Ônibus", "2026-08-12"],
    ] as const) {
      await t.createTransaction(ctx, {
        kind: "expense",
        amountCents: 1_000,
        accountId,
        categoryId,
        description,
        occurredOn,
      });
    }
    const descriptions = async (
      filters: Omit<
        import("./transactions").TransactionFilters,
        "start" | "end"
      >,
    ) =>
      (await t.listTransactions(ctx, { ...august, ...filters })).items
        .map((item) => item.description)
        .sort();

    const { categoryWithDescendants } = await import(
      "@/components/transactions/statement-params"
    );
    const all = await d.categories.listCategories("owner");
    expect(categoryWithDescendants(all, ids.groceries)).toEqual([
      ids.groceries,
      market.id,
    ]);

    expect(
      await descriptions({
        categoryIds: categoryWithDescendants(all, ids.groceries),
      }),
    ).toEqual(["Feira de sábado", "Supermercado"]);
    expect(await descriptions({ categoryIds: [market.id] })).toEqual([
      "Feira de sábado",
    ]);
    expect(
      await descriptions({
        categoryIds: [ids.groceries, market.id],
        accountId: ids.checking,
      }),
    ).toEqual(["Feira de sábado"]);
    expect(await descriptions({ categoryIds: [] })).toEqual([
      "Feira de sábado",
      "Supermercado",
      "Ônibus",
    ]);

    // Another person's category matches none of Ana's entries.
    const [bruno] = await d.categories.listCategories("other");
    if (!bruno) throw new Error("categoria do Bruno");
    expect(await descriptions({ categoryIds: [bruno.id] })).toEqual([]);
  });

  describe("each filter of the statement, in July", () => {
    const july = { start: "2026-07-01", end: "2026-07-31" };
    const list = (
      filters: Omit<
        import("./transactions").TransactionFilters,
        "start" | "end"
      > = {},
      context = ctx,
    ) => d.transactions.listTransactions(context, { ...july, ...filters });
    const rows = async (
      filters: Parameters<typeof list>[0] = {},
      context = ctx,
    ) =>
      (await list(filters, context)).items
        .map((item) => `${item.description} ${item.amountCents}`)
        .sort();
    // periodTotals negates the expense sums, so an empty one comes as -0.
    const totalsOf = async (accountId?: string) =>
      Object.fromEntries(
        Object.entries(
          await d.transactions.periodTotals(
            ctx,
            july.start,
            july.end,
            accountId,
          ),
        ).map(([key, cents]) => [key, cents + 0]),
      );

    beforeAll(async () => {
      const t = d.transactions;
      await t.createTransaction(ctx, {
        kind: "income",
        amountCents: 500_000,
        accountId: ids.checking,
        categoryId: ids.salary,
        description: "Salário julho",
        occurredOn: "2026-07-05",
      });
      await t.createTransfer(ctx, {
        fromAccountId: ids.checking,
        toAccountId: ids.reserve,
        amountCents: 80_000,
        occurredOn: "2026-07-06",
        description: "Guardar",
      });
      await t.createTransaction(ctx, {
        kind: "expense",
        amountCents: 12_000,
        accountId: ids.checking,
        categoryId: ids.groceries,
        description: "Mercado do mês",
        occurredOn: "2026-07-10",
      });
      await t.createTransaction(ctx, {
        kind: "expense",
        amountCents: 3_000,
        accountId: ids.card,
        categoryId: ids.transport,
        description: "Corrida",
        occurredOn: "2026-07-11",
      });
      await t.createTransaction(ctx, {
        kind: "expense",
        amountCents: 4_500,
        accountId: ids.wallet,
        categoryId: ids.groceries,
        description: "Feira",
        occurredOn: "2026-07-12",
        paid: false,
      });
      await t.createTransaction(ctx, {
        kind: "expense",
        amountCents: 150_000,
        accountId: ids.checking,
        categoryId: ids.housing,
        description: "Aluguel julho",
        occurredOn: "2026-07-20",
        paid: false,
      });
    });

    it("shows a transfer once without an account, as its outgoing leg", async () => {
      expect(await rows()).toEqual([
        "Aluguel julho -150000",
        "Corrida -3000",
        "Feira -4500",
        "Guardar -80000",
        "Mercado do mês -12000",
        "Salário julho 500000",
      ]);
    });

    it("by account: each leg of a transfer in its own account, and the card", async () => {
      const reserve = await list({ accountId: ids.reserve });
      expect(reserve.items).toHaveLength(1);
      expect(reserve.items[0]).toMatchObject({
        description: "Guardar",
        amountCents: 80_000,
        accountId: ids.reserve,
        counterpartName: "Conta principal",
      });

      const checking = await list({ accountId: ids.checking });
      expect(
        checking.items.every((item) => item.accountId === ids.checking),
      ).toBe(true);
      expect(await rows({ accountId: ids.checking })).toEqual([
        "Aluguel julho -150000",
        "Guardar -80000",
        "Mercado do mês -12000",
        "Salário julho 500000",
      ]);
      expect(
        checking.items.find((item) => item.kind === "transfer")
          ?.counterpartName,
      ).toBe("Reserva");

      expect(await rows({ accountId: ids.card })).toEqual(["Corrida -3000"]);
      expect(await rows({ accountId: ids.wallet })).toEqual(["Feira -4500"]);
    });

    it("by kind, status and search", async () => {
      expect(await rows({ kind: "income" })).toEqual(["Salário julho 500000"]);
      expect(await rows({ kind: "transfer" })).toEqual(["Guardar -80000"]);
      expect(await rows({ kind: "transfer", accountId: ids.reserve })).toEqual([
        "Guardar 80000",
      ]);
      expect(await rows({ kind: "expense" })).toEqual([
        "Aluguel julho -150000",
        "Corrida -3000",
        "Feira -4500",
        "Mercado do mês -12000",
      ]);
      expect(await rows({ status: "pending" })).toEqual([
        "Aluguel julho -150000",
        "Feira -4500",
      ]);
      expect(await rows({ status: "paid", kind: "expense" })).toEqual([
        "Corrida -3000",
        "Mercado do mês -12000",
      ]);
      expect(await rows({ q: "ALUGUEL" })).toEqual(["Aluguel julho -150000"]);
      expect(await rows({ q: "salario" })).toEqual(["Salário julho 500000"]);
    });

    it("combines the filters", async () => {
      expect(
        await rows({
          accountId: ids.checking,
          kind: "expense",
          status: "pending",
        }),
      ).toEqual(["Aluguel julho -150000"]);
      expect(
        await rows({ categoryIds: [ids.groceries], status: "paid" }),
      ).toEqual(["Mercado do mês -12000"]);
      expect(
        await rows({ categoryIds: [ids.groceries], accountId: ids.wallet }),
      ).toEqual(["Feira -4500"]);
      // Mercado holds only expenses: with Receitas nothing is left.
      expect(
        await rows({ categoryIds: [ids.groceries], kind: "income" }),
      ).toEqual([]);
      expect(await rows({ q: "feira", accountId: ids.checking })).toEqual([]);
    });

    it("totals by account the same as summing the listed rows", async () => {
      const { summarize } = await import(
        "@/components/transactions/statement-data"
      );
      for (const accountId of [
        undefined,
        ids.checking,
        ids.reserve,
        ids.card,
        ids.wallet,
      ]) {
        const { transferCents: _, ...fromList } = summarize(
          (await list({ accountId })).items,
        );
        expect(
          await totalsOf(accountId),
          accountId ?? "todas as contas",
        ).toEqual(fromList);
      }
      expect(await totalsOf(ids.checking)).toEqual({
        incomeCents: 500_000,
        expenseCents: 12_000,
        pendingIncomeCents: 0,
        pendingExpenseCents: 150_000,
      });
    });

    it("brings nothing for another person's account, either way", async () => {
      const [brunoWallet] = await d.accounts.listAccounts("other");
      if (!brunoWallet) throw new Error("carteira do Bruno");
      expect(await rows({ accountId: brunoWallet.id })).toEqual([]);
      expect(await totalsOf(brunoWallet.id)).toEqual({
        incomeCents: 0,
        expenseCents: 0,
        pendingIncomeCents: 0,
        pendingExpenseCents: 0,
      });

      const bruno = await d.context.getUserContext("other", { now: NOW });
      expect(await rows({ accountId: ids.checking }, bruno)).toEqual([]);
      expect(await rows({ categoryIds: [ids.groceries] }, bruno)).toEqual([]);
    });
  });
});
