// The benefício (vale-refeição, vale-alimentação; doc 02 §6.7, doc 03 §12):
// outside the Saldo em contas, the forecast, the Fluxo and the daily notices'
// amounts, out of the net worth unless the person says so, its own line in
// Quanto dá para gastar por dia and never paying a card's invoice, against a
// real (in-memory) Postgres, on 14/out/2026.
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  cards: typeof import("./cards");
  context: typeof import("./context");
  dashboard: typeof import("./dashboard");
  preferences: typeof import("./preferences");
  quickAdd: typeof import("./quick-add");
  reminders: typeof import("./reminders");
  reports: typeof import("./reports");
  transactions: typeof import("./transactions");
};

let d: Domain;
let db: typeof import("../db/client").db;
let schema: typeof import("../db/schema");

// 14/out/2026, 12:00 in São Paulo: 18 days to the end of the month.
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);
const TODAY = "2026-10-14";
const LATER = "2026-10-20";
const DAYS_LEFT = 18;

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

const checkingOf = (id: string, initialBalanceCents = 100_000) =>
  d.accounts.createAccount(id, {
    name: "Conta",
    type: "checking",
    initialBalanceCents,
  });

const benefitOf = (
  id: string,
  extra: { includeInNetWorth?: boolean; initialBalanceCents?: number } = {},
) =>
  d.accounts.createAccount(id, {
    name: "Vale-refeição",
    type: "benefit",
    initialBalanceCents: 48_000,
    ...extra,
  });

const entry = (
  kind: "expense" | "income",
  accountId: string,
  amountCents: number,
  occurredOn: string,
  description = kind === "expense" ? "Almoço" : "Recarga",
) => ({ kind, accountId, amountCents, occurredOn, description });

/** Everything the benefício must leave as it was. */
async function moneyToSpend(id: string) {
  const ctx = await ctxOf(id);
  const range = rangeOf(ctx);
  const [summary, forecast, flow, perDay, daily, countdown] = await Promise.all(
    [
      d.dashboard.getBalanceSummary(ctx, range),
      d.dashboard.forecastUntil(ctx, range.end),
      d.reports.cashFlowReport(ctx, range),
      d.dashboard.getSpendablePerDay(ctx),
      d.reminders.loadDailySummary(ctx),
      d.reminders.loadIncomeCountdown(ctx),
    ],
  );
  return {
    summary,
    forecast,
    flow: { days: flow.days, endCents: flow.endCents },
    perDay: {
      rows: perDay.rows.map((row) => [row.date, row.perDayCents]),
      shortfallCents: perDay.shortfallCents,
      balanceTodayCents: perDay.balanceTodayCents,
    },
    dailyBalanceCents: daily.balanceCents,
    countdown,
  };
}

const netWorthNow = async (id: string) => {
  const ctx = await ctxOf(id);
  const points = await d.reports.netWorthBreakdown(ctx, rangeOf(ctx), 1);
  return points.at(-1)?.netCents;
};

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  schema = await import("../db/schema");
  d = {
    accounts: await import("./accounts"),
    cards: await import("./cards"),
    context: await import("./context"),
    dashboard: await import("./dashboard"),
    preferences: await import("./preferences"),
    quickAdd: await import("./quick-add"),
    reminders: await import("./reminders"),
    reports: await import("./reports"),
    transactions: await import("./transactions"),
  };
}, 60_000);

describe("the benefit type", () => {
  it("is accepted by the database, out of the net worth, with its icon and color", async () => {
    await person("tipo");
    const id = await benefitOf("tipo");
    const vr = (await d.accounts.listAccounts("tipo")).find(
      (account) => account.id === id,
    );
    expect(vr).toMatchObject({
      type: "benefit",
      icon: "utensils-crossed",
      color: "cat-4",
      balanceCents: 48_000,
      includeInNetWorth: false,
    });
  });

  it("keeps an explicit choice to count it in the net worth", async () => {
    await person("tipo-patrimonio");
    await benefitOf("tipo-patrimonio", { includeInNetWorth: true });
    const [vr] = await d.accounts.listAccounts("tipo-patrimonio");
    expect(vr?.includeInNetWorth).toBe(true);
  });
});

describe("the money to spend", () => {
  for (const includeInNetWorth of [false, true]) {
    it(`stays the same with a benefício ${includeInNetWorth ? "in" : "out of"} the net worth and its entries`, async () => {
      const id = `igual-${includeInNetWorth}`;
      await person(id);
      const checking = await checkingOf(id);
      const ctx = await ctxOf(id);
      // The salary on 18/out and the rent on 20/out, in the checking account.
      await d.transactions.createTransaction(ctx, {
        ...entry("income", checking, 500_000, "2026-10-18", "Salário"),
        categoryId: null,
      });
      await d.transactions.createTransaction(ctx, {
        ...entry("expense", checking, 150_000, LATER, "Aluguel"),
        categoryId: null,
      });
      const before = await moneyToSpend(id);
      const worthBefore = await netWorthNow(id);

      const vr = await benefitOf(id, { includeInNetWorth });
      for (const item of [
        entry("expense", vr, 3_000, TODAY),
        entry("expense", vr, 6_000, LATER),
        // Sooner than the salary: never the Próxima receita.
        entry("income", vr, 10_000, "2026-10-16"),
      ]) {
        await d.transactions.createTransaction(ctx, {
          ...item,
          categoryId: null,
        });
      }
      const after = await moneyToSpend(id);
      expect(after.summary).toEqual(before.summary);
      expect(after.forecast).toEqual(before.forecast);
      expect(after.flow).toEqual(before.flow);
      expect(after.perDay).toEqual(before.perDay);
      expect(after.dailyBalanceCents).toBe(before.dailyBalanceCents);
      expect(after.countdown).toEqual(before.countdown);
      expect(after.countdown?.description).toBe("Salário");

      // Patrimônio: only with the switch on, 48.000 − 3.000 paid today.
      expect(await netWorthNow(id)).toBe(
        (worthBefore ?? 0) + (includeInNetWorth ? 45_000 : 0),
      );
    });
  }

  it("leaves the invite when the benefício is the only account", async () => {
    await person("so-beneficio");
    await benefitOf("so-beneficio");
    const ctx = await ctxOf("so-beneficio");
    expect((await d.dashboard.getSpendablePerDay(ctx)).hasAccounts).toBe(false);
    expect(await d.reminders.loadDailySummary(ctx)).toMatchObject({
      hasLiquidAccount: false,
      balanceCents: 0,
    });
  });
});

describe("Quanto dá para gastar por dia", () => {
  it("gives the benefício a line of its own next to a single account", async () => {
    await person("linha");
    await checkingOf("linha");
    const vr = await benefitOf("linha");
    const ctx = await ctxOf("linha");
    await d.transactions.createTransaction(ctx, {
      ...entry("expense", vr, 3_000, TODAY),
      categoryId: null,
    });
    await d.transactions.createTransaction(ctx, {
      ...entry("expense", vr, 6_000, LATER),
      categoryId: null,
    });
    const spendable = await d.dashboard.getSpendablePerDay(ctx);
    expect(spendable.accounts).toEqual([
      expect.objectContaining({ id: vr, type: "benefit", shown: true }),
    ]);
    const [today] = spendable.rows;
    // The total: the checking account alone.
    expect(today?.perDayCents).toBe(Math.floor(100_000 / DAYS_LEFT));
    // 48.000 − 3.000 today − 6.000 on 20/out, its lowest point.
    expect(today?.byAccount).toEqual([
      { accountId: vr, perDayCents: Math.floor(39_000 / DAYS_LEFT) },
    ]);
    expect(spendable.unassignedCards).toEqual([]);
  });

  it("lists it after two accounts to spend from, and leaves it out when hidden", async () => {
    await person("tres");
    const checking = await checkingOf("tres");
    const wallet = await d.accounts.createAccount("tres", {
      name: "Carteira",
      type: "cash",
      initialBalanceCents: 18_000,
    });
    const vr = await benefitOf("tres");
    let spendable = await d.dashboard.getSpendablePerDay(await ctxOf("tres"));
    expect(spendable.accounts.map((item) => item.id)).toEqual([
      checking,
      wallet,
      vr,
    ]);
    expect(spendable.rows[0]?.byAccount).toEqual([
      { accountId: checking, perDayCents: Math.floor(100_000 / DAYS_LEFT) },
      { accountId: wallet, perDayCents: 1_000 },
      { accountId: vr, perDayCents: Math.floor(48_000 / DAYS_LEFT) },
    ]);
    const totals = spendable.rows.map((row) => row.perDayCents);

    await d.preferences.setDailySpendHidden("tres", [vr]);
    spendable = await d.dashboard.getSpendablePerDay(await ctxOf("tres"));
    expect(spendable.accounts.map((item) => [item.id, item.shown])).toEqual([
      [checking, true],
      [wallet, true],
      [vr, false],
    ]);
    expect(spendable.rows[0]?.byAccount.map((item) => item.accountId)).toEqual([
      checking,
      wallet,
    ]);
    expect(spendable.rows.map((row) => row.perDayCents)).toEqual(totals);
  });

  it("leaves an archived benefício out", async () => {
    await person("arquivado");
    await checkingOf("arquivado");
    const vr = await benefitOf("arquivado");
    await d.accounts.archiveAccount("arquivado", vr);
    const spendable = await d.dashboard.getSpendablePerDay(
      await ctxOf("arquivado"),
    );
    expect(spendable.accounts).toEqual([]);
    expect(spendable.rows.every((row) => row.byAccount.length === 0)).toBe(
      true,
    );
  });
});

describe("a benefício never pays a card's invoice", () => {
  async function withCard(id: string) {
    await person(id);
    const checking = await checkingOf(id);
    const vr = await benefitOf(id);
    const card = await d.accounts.createAccount(id, {
      name: "Cartão",
      type: "credit_card",
      initialBalanceCents: 0,
      card: { limitCents: 100_000, closingDay: 17, dueDay: 25 },
    });
    const ctx = await ctxOf(id);
    await d.transactions.createTransaction(ctx, {
      ...entry("expense", card, 20_000, "2026-10-10"),
      categoryId: null,
    });
    return { checking, vr, card, ctx };
  }

  it("refuses to pay an invoice, transfer to a card or be chosen to pay one", async () => {
    const { checking, vr, card, ctx } = await withCard("guarda");
    const [invoice] = await d.cards.listInvoices(ctx, card);
    if (!invoice) throw new Error("fatura");
    const refused = "O benefício não paga fatura de cartão.";
    await expect(
      d.cards.payInvoice(ctx, {
        invoiceId: invoice.id,
        fromAccountId: vr,
        amountCents: 5_000,
        occurredOn: TODAY,
      }),
    ).rejects.toThrow(refused);
    await expect(
      d.transactions.createTransfer(ctx, {
        fromAccountId: vr,
        toAccountId: card,
        amountCents: 5_000,
        occurredOn: TODAY,
      }),
    ).rejects.toThrow(refused);
    await expect(
      d.accounts.updateAccount("guarda", card, {
        card: {
          limitCents: 100_000,
          closingDay: 17,
          dueDay: 25,
          paymentAccountId: vr,
        },
      }),
    ).rejects.toThrow(refused);
    await expect(
      d.accounts.createAccount("guarda", {
        name: "Outro cartão",
        type: "credit_card",
        initialBalanceCents: 0,
        card: {
          limitCents: 100_000,
          closingDay: 17,
          dueDay: 25,
          paymentAccountId: vr,
        },
      }),
    ).rejects.toThrow(refused);
    // Nothing was written: the benefício and the invoice are as they were.
    const accounts = await d.accounts.listAccounts("guarda");
    expect(accounts.find((item) => item.id === vr)?.balanceCents).toBe(48_000);
    expect(accounts.map((item) => item.name)).not.toContain("Outro cartão");
    const [after] = await d.cards.listInvoices(ctx, card);
    expect(after?.paidCents).toBe(0);
    // The checking account still pays it.
    await d.cards.payInvoice(ctx, {
      invoiceId: invoice.id,
      fromAccountId: checking,
      amountCents: 5_000,
      occurredOn: TODAY,
    });
  });

  it("moves money to and from an account that is not a card", async () => {
    const { checking, vr, ctx } = await withCard("transfere");
    await d.transactions.createTransfer(ctx, {
      fromAccountId: checking,
      toAccountId: vr,
      amountCents: 2_000,
      occurredOn: TODAY,
    });
    await d.transactions.createTransfer(ctx, {
      fromAccountId: vr,
      toAccountId: checking,
      amountCents: 500,
      occurredOn: TODAY,
    });
    const accounts = await d.accounts.listAccounts("transfere");
    expect(accounts.find((item) => item.id === vr)?.balanceCents).toBe(49_500);
    expect(accounts.find((item) => item.id === checking)?.balanceCents).toBe(
      98_500,
    );
    // The Saldo em contas follows the checking account alone.
    const summary = await d.dashboard.getBalanceSummary(ctx, rangeOf(ctx));
    expect(summary.balanceCents).toBe(98_500);
  });
});

describe("changing the type", () => {
  it("turns an account into a benefício and back, the icon following, the switch kept", async () => {
    await person("muda");
    await checkingOf("muda", 1_000);
    const id = await checkingOf("muda", 30_000);
    const ctx = await ctxOf("muda");
    expect(
      (await d.dashboard.getBalanceSummary(ctx, rangeOf(ctx))).balanceCents,
    ).toBe(31_000);

    await d.accounts.updateAccount("muda", id, { type: "benefit" });
    let row = (await d.accounts.listAccounts("muda")).find(
      (item) => item.id === id,
    );
    expect(row).toMatchObject({
      type: "benefit",
      icon: "utensils-crossed",
      includeInNetWorth: true,
    });
    const after = await ctxOf("muda");
    expect(
      (await d.dashboard.getBalanceSummary(after, rangeOf(after))).balanceCents,
    ).toBe(1_000);
    expect(
      (await d.dashboard.getSpendablePerDay(after)).accounts.map(
        (item) => item.id,
      ),
    ).toEqual([id]);

    await d.accounts.updateAccount("muda", id, { type: "checking" });
    row = (await d.accounts.listAccounts("muda")).find(
      (item) => item.id === id,
    );
    expect(row).toMatchObject({
      type: "checking",
      icon: "landmark",
      includeInNetWorth: true,
    });
  });
});

describe("entries on a benefício", () => {
  it("count in the categories and the period totals, never as the default account", async () => {
    await person("lancamentos");
    const checking = await checkingOf("lancamentos");
    const vr = await benefitOf("lancamentos");
    const ctx = await ctxOf("lancamentos");
    const range = rangeOf(ctx);
    const [food] = await db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.userId, "lancamentos"),
          eq(schema.categories.kind, "expense"),
        ),
      )
      .limit(1);
    if (!food) throw new Error("categoria");
    await d.transactions.createTransaction(ctx, {
      ...entry("expense", vr, 4_200, TODAY),
      categoryId: food.id,
    });
    expect(
      await d.transactions.periodTotals(ctx, range.start, range.end),
    ).toMatchObject({ expenseCents: 4_200 });
    const breakdown = await d.reports.categoryBreakdown(
      ctx,
      range.start,
      range.end,
    );
    expect(breakdown.totalCents).toBe(4_200);
    // The last expense was on the benefício: the form opens on the account.
    expect((await d.quickAdd.getQuickAddData(ctx)).lastAccountId).toBe(
      checking,
    );
  });
});

describe("isolation", () => {
  it("never shows nor moves another person's benefício", async () => {
    await person("dona");
    await checkingOf("dona");
    const vr = await benefitOf("dona");
    await person("intruso");
    const mine = await checkingOf("intruso", 10_000);
    const intruder = await ctxOf("intruso");
    await expect(
      d.transactions.createTransfer(intruder, {
        fromAccountId: mine,
        toAccountId: vr,
        amountCents: 1_000,
        occurredOn: TODAY,
      }),
    ).rejects.toThrow();
    await expect(
      d.transactions.createTransaction(intruder, {
        ...entry("expense", vr, 1_000, TODAY),
        categoryId: null,
      }),
    ).rejects.toThrow();
    expect((await d.dashboard.getSpendablePerDay(intruder)).accounts).toEqual(
      [],
    );
    const owned = (await d.accounts.listAccounts("dona")).find(
      (account) => account.id === vr,
    );
    expect(owned?.balanceCents).toBe(48_000);
  });
});
