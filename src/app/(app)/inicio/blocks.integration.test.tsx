// The loaders of the blocks of the reports on the Início (doc 02 §6.3)
// against a real (in-memory) Postgres, on 14/out/2026 like the mockups: which
// element each month gets (the block or its invite), with what data and
// links, each account seeing only its own money.

import { eq } from "drizzle-orm";
import type { ReactElement } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

// React `cache` is a no-op outside a Server Components render. Here it
// memoises like one request does (by the identity of each argument), so the
// test can see what the blocks of one Início read once; each test is a
// request of its own.
const memo = vi.hoisted(() => ({ stores: new Set<Map<unknown, unknown>>() }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  const VALUE = Symbol("value");
  return {
    ...react,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const store = new Map<unknown, unknown>();
      memo.stores.add(store);
      return (...args: A): R => {
        let node = store;
        for (const arg of args) {
          let next = node.get(arg) as Map<unknown, unknown> | undefined;
          if (!next) {
            next = new Map();
            node.set(arg, next);
          }
          node = next;
        }
        if (!node.has(VALUE)) node.set(VALUE, fn(...args));
        return node.get(VALUE) as R;
      };
    },
  };
});

// Counts the reads the blocks share (src/server/domain/request-reads.ts).
vi.mock("@/server/domain/accounts", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/server/domain/accounts")>();
  return { ...real, listAccounts: vi.fn(real.listAccounts) };
});
vi.mock("@/server/domain/transactions", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/server/domain/transactions")>();
  return { ...real, pendingEntries: vi.fn(real.pendingEntries) };
});

// Server Actions are not available outside Next (the quick add of the
// invites and the cards).
vi.mock("@/server/actions/preferences", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/server/actions/tips", () => ({
  markTipsSeenAction: vi.fn(),
  setTipsOffAction: vi.fn(),
  resetTipsAction: vi.fn(),
}));

type Loaders = typeof import("./blocks");
type Context = typeof import("@/server/domain/context");
type UserContext = import("@/server/domain/context").UserContext;

let blocks: Loaders;
let context: Context;
let accounts: typeof import("@/server/domain/accounts");
let transactions: typeof import("@/server/domain/transactions");
let ana: UserContext;
let bia: UserContext;
let caio: UserContext;
const components = {} as {
  balance: typeof import("@/components/dashboard/balance-hero");
  cashFlow: typeof import("@/components/dashboard/cash-flow-block");
  categories: typeof import("@/components/dashboard/category-breakdown-block");
  incomeExpense: typeof import("@/components/dashboard/income-expense-block");
  installmentsEnding: typeof import("@/components/dashboard/installments-ending-block");
  netWorth: typeof import("@/components/dashboard/net-worth-block");
  noRecords: typeof import("@/components/dashboard/block-no-records");
  spendable: typeof import("@/components/dashboard/spendable-per-day-block");
  topExpenses: typeof import("@/components/dashboard/top-expenses-block");
};

// 14/out/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);

type Props = Record<string, unknown>;

/** What a block's loader renders for a month (`YYYY-MM`). */
async function load(
  id:
    | "balance"
    | "cash-flow"
    | "category-breakdown"
    | "income-expense"
    | "net-worth",
  ctx: UserContext,
  month: string,
) {
  const range = context.resolvePeriod(ctx, month);
  const element = (await blocks.HOME_BLOCK_LOADERS[id]({
    ctx,
    range,
  })) as ReactElement<Props>;
  return { type: element.type, props: element.props };
}

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { db } = await import("@/server/db/client");
  await migrate(db as never, { migrationsFolder: "drizzle" });
  const schema = await import("@/server/db/schema");
  const { ensureOwnerDefaults } = await import("@/server/db/seed-defaults");
  await db.insert(schema.user).values([
    { id: "ana", name: "Ana", email: "ana@exemplo.com" },
    { id: "bia", name: "Bia", email: "bia@exemplo.com" },
    { id: "caio", name: "Caio", email: "caio@exemplo.com" },
  ]);
  await ensureOwnerDefaults("ana");

  context = await import("@/server/domain/context");
  accounts = await import("@/server/domain/accounts");
  transactions = await import("@/server/domain/transactions");
  blocks = await import("./blocks");
  components.balance = await import("@/components/dashboard/balance-hero");
  components.cashFlow = await import("@/components/dashboard/cash-flow-block");
  components.categories = await import(
    "@/components/dashboard/category-breakdown-block"
  );
  components.incomeExpense = await import(
    "@/components/dashboard/income-expense-block"
  );
  components.installmentsEnding = await import(
    "@/components/dashboard/installments-ending-block"
  );
  components.netWorth = await import("@/components/dashboard/net-worth-block");
  components.noRecords = await import(
    "@/components/dashboard/block-no-records"
  );
  components.spendable = await import(
    "@/components/dashboard/spendable-per-day-block"
  );
  components.topExpenses = await import(
    "@/components/dashboard/top-expenses-block"
  );
  const { listCategories } = await import("@/server/domain/categories");

  ana = await context.getUserContext("ana", { now: NOW });
  bia = await context.getUserContext("bia", { now: NOW });
  caio = await context.getUserContext("caio", { now: NOW });

  const checking = await accounts.createAccount("ana", {
    name: "Conta principal",
    type: "checking",
    initialBalanceCents: 0,
  });
  const card = await accounts.createAccount("ana", {
    name: "Cartão Principal",
    type: "credit_card",
    initialBalanceCents: 0,
    card: { limitCents: 550_000, closingDay: 17, dueDay: 25 },
  });
  // Bia has an account, empty: every block invites her. Caio has none.
  const biaAccount = await accounts.createAccount("bia", {
    name: "Conta da Bia",
    type: "checking",
    initialBalanceCents: 0,
  });
  // Created long before the month under test, so her empty months are
  // after her first record (not "Sem registros").
  await db
    .update(schema.finAccounts)
    .set({ createdAt: new Date("2026-01-10T12:00:00Z") })
    .where(eq(schema.finAccounts.id, biaAccount));

  const all = await listCategories("ana");
  const category = (name: string) => {
    const found = all.find((item) => item.name === name);
    if (!found) throw new Error(`categoria ${name}`);
    return found.id;
  };
  const entry = (
    kind: "income" | "expense",
    accountId: string,
    name: string,
    description: string,
    amountCents: number,
    occurredOn: string,
    extra: { paid?: boolean; recurrence?: { freq: "monthly" } } = {},
  ) =>
    transactions.createTransaction(ana, {
      kind,
      amountCents,
      accountId,
      categoryId: category(name),
      description,
      occurredOn,
      ...extra,
    });

  // September, all paid.
  await entry("income", checking, "Salário", "Salário", 780_000, "2026-09-05");
  await entry("expense", checking, "Moradia", "Aluguel", 210_000, "2026-09-15");
  await entry("expense", card, "Mercado", "Atacadão", 30_000, "2026-09-20");
  // October up to today, and the rent scheduled for the 15th, monthly.
  await entry("income", checking, "Salário", "Salário", 780_000, "2026-10-07");
  await entry(
    "expense",
    checking,
    "Mercado",
    "Supermercado",
    6_450,
    "2026-10-14",
  );
  await entry("expense", card, "Transporte", "Corrida", 2_290, "2026-10-14");
  await entry(
    "expense",
    checking,
    "Moradia",
    "Aluguel",
    210_000,
    "2026-10-15",
    {
      recurrence: { freq: "monthly" },
    },
  );
}, 120_000);

beforeEach(() => {
  for (const store of memo.stores) store.clear();
  vi.mocked(accounts.listAccounts).mockClear();
  vi.mocked(transactions.pendingEntries).mockClear();
});

describe("Fluxo de caixa", () => {
  it("shows the month on screen, the report a click away", async () => {
    const { type, props } = await load("cash-flow", ana, "2026-10");
    expect(type).toBe(components.cashFlow.CashFlowBlock);
    expect(props).toMatchObject({
      start: "2026-10-01",
      end: "2026-10-31",
      today: "2026-10-14",
      reportHref: "/relatorios/fluxo",
    });
    expect((props.report as { phase: string }).phase).toBe("current");
  });

  it("keeps another month in the link", async () => {
    const past = await load("cash-flow", ana, "2026-09");
    expect(past.type).toBe(components.cashFlow.CashFlowBlock);
    expect(past.props.reportHref).toBe("/relatorios/fluxo?mes=2026-09");
    expect((past.props.report as { phase: string }).phase).toBe("past");
    const ahead = await load("cash-flow", ana, "2026-11");
    expect(ahead.type).toBe(components.cashFlow.CashFlowBlock);
    expect(ahead.props.reportHref).toBe("/relatorios/fluxo?mes=2026-11");
    expect((ahead.props.report as { phase: string }).phase).toBe("future");
  });

  it("invites without an account off the cards, or in an empty month", async () => {
    const none = await load("cash-flow", caio, "2026-10");
    expect(none.type).toBe(components.cashFlow.CashFlowNoAccountsInvite);
    const empty = await load("cash-flow", bia, "2026-10");
    expect(empty.type).toBe(components.cashFlow.CashFlowInvite);
    expect(empty.props.monthName).toBe("outubro");
  });

  it("reads the accounts and the pending entries once with the Saldo", async () => {
    const range = context.resolvePeriod(ana, "2026-10");
    await blocks.HOME_BLOCK_LOADERS.balance({ ctx: ana, range });
    await blocks.HOME_BLOCK_LOADERS["cash-flow"]({ ctx: ana, range });
    expect(accounts.listAccounts).toHaveBeenCalledTimes(1);
    expect(transactions.pendingEntries).toHaveBeenCalledTimes(1);
  });
});

describe("Sem registros", () => {
  it("replaces the charted blocks before the first record", async () => {
    // Ana's first entry is on 5/set/2026.
    for (const id of [
      "cash-flow",
      "net-worth",
      "category-breakdown",
      "income-expense",
    ] as const) {
      const { type, props } = await load(id, ana, "2026-08");
      expect(type).toBe(components.noRecords.BlockNoRecords);
      expect(props).toEqual({
        month: "2026-08",
        firstMonth: "2026-09",
        href: "/inicio?mes=2026-09",
      });
    }
  });

  it("is never the answer for the first month, the present or the future", async () => {
    for (const month of ["2026-09", "2026-10", "2026-12"]) {
      for (const id of [
        "cash-flow",
        "net-worth",
        "category-breakdown",
        "income-expense",
      ] as const) {
        const { type } = await load(id, ana, month);
        expect(type).not.toBe(components.noRecords.BlockNoRecords);
      }
    }
  });
});

describe("Para onde foi o dinheiro", () => {
  it("ranks the month's paid expenses, the report a click away", async () => {
    const { type, props } = await load("category-breakdown", ana, "2026-10");
    expect(type).toBe(components.categories.CategoryBreakdownBlock);
    expect(props).toMatchObject({
      monthName: "outubro",
      isCurrent: true,
      // Paid so far: the rent of the 15th is still ahead.
      totalCents: 6_450 + 2_290,
      link: {
        href: "/relatorios/categorias?periodo=1",
        label: "Ver relatório",
      },
    });
    const names = (props.items as { name: string }[]).map((item) => item.name);
    expect(names.sort()).toEqual(["Mercado", "Transporte"]);
    // Each row opens the category's detail over the month on screen.
    const hrefFor = props.hrefFor as (id: string) => string;
    expect(hrefFor("abc")).toBe("/relatorios/categorias/abc?periodo=1");
  });

  it("opens the report on another month, not the statement", async () => {
    const { type, props } = await load("category-breakdown", ana, "2026-09");
    expect(type).toBe(components.categories.CategoryBreakdownBlock);
    expect(props).toMatchObject({
      isCurrent: false,
      totalCents: 210_000 + 30_000,
      link: {
        href: "/relatorios/categorias?periodo=1&mes=2026-09",
        label: "Ver relatório",
      },
    });
  });

  it("invites in a month without paid expenses, a month ahead included", async () => {
    const ahead = await load("category-breakdown", ana, "2026-11");
    expect(ahead.type).toBe(components.categories.CategoryBreakdownInvite);
    expect(ahead.props.monthName).toBe("novembro");
    const other = await load("category-breakdown", bia, "2026-10");
    expect(other.type).toBe(components.categories.CategoryBreakdownInvite);
  });
});

describe("Receitas × despesas por mês", () => {
  const lastMonth = (props: Props) =>
    (props.months as { month: string }[]).at(-1)?.month;

  it("compares the 6 months up to the one on screen", async () => {
    const { type, props } = await load("income-expense", ana, "2026-10");
    expect(type).toBe(components.incomeExpense.IncomeExpenseBlock);
    expect(props.months).toHaveLength(6);
    expect(lastMonth(props)).toBe("2026-10");
    expect(props).toMatchObject({
      endMonthName: "outubro",
      partialProgress: "até o dia 14 de 31",
      reportHref: "/relatorios/visao-geral?periodo=6",
    });
  });

  it("ends in a past month, complete, the report on that month", async () => {
    const { props } = await load("income-expense", ana, "2026-09");
    expect(props.reportHref).toBe(
      "/relatorios/visao-geral?periodo=6&mes=2026-09",
    );
    expect(lastMonth(props)).toBe("2026-09");
    expect(props.endMonthName).toBe("setembro");
    expect(props.partialProgress).toBeNull();
  });

  it("stops at today's month for a month ahead", async () => {
    const { props } = await load("income-expense", ana, "2026-12");
    expect(props.months).toHaveLength(6);
    expect(lastMonth(props)).toBe("2026-10");
    expect(props.endMonthName).toBe("outubro");
    expect(props.reportHref).toBe("/relatorios/visao-geral?periodo=6");
  });

  it("invites after 6 empty months", async () => {
    const { type } = await load("income-expense", bia, "2026-10");
    expect(type).toBe(components.incomeExpense.IncomeExpenseInvite);
  });
});

describe("Patrimônio", () => {
  const points = (props: Props) => props.points as { month: string }[];

  it("starts at the first record: its month and the one before, up to today", async () => {
    // Ana's records begin in September: the 7 points shrink to 3.
    const { type, props } = await load("net-worth", ana, "2026-10");
    expect(type).toBe(components.netWorth.NetWorthBlock);
    expect(points(props)).toHaveLength(3);
    expect(points(props).at(0)?.month).toBe("2026-08");
    expect(points(props).at(-1)?.month).toBe("2026-10");
    expect(props).toMatchObject({
      caption: "hoje",
      reportHref: "/relatorios/patrimonio?periodo=6",
    });
  });

  it("ends at the end of a past month, and today for a month ahead", async () => {
    const past = await load("net-worth", ana, "2026-09");
    expect(points(past.props).at(-1)?.month).toBe("2026-09");
    expect(past.props.caption).toBe("no fim de setembro");
    expect(past.props.reportHref).toBe(
      "/relatorios/patrimonio?periodo=6&mes=2026-09",
    );
    const ahead = await load("net-worth", ana, "2026-12");
    expect(points(ahead.props).at(-1)?.month).toBe("2026-10");
    expect(ahead.props.caption).toBe("hoje");
    // A month ahead has no report: the link is the one of today.
    expect(ahead.props.reportHref).toBe("/relatorios/patrimonio?periodo=6");
  });

  it("invites while everything is at zero", async () => {
    const { type } = await load("net-worth", bia, "2026-10");
    expect(type).toBe(components.netWorth.NetWorthInvite);
  });
});

describe("Saldo e caixinhas", () => {
  it("shows what is set aside only for whoever has a caixinha", async () => {
    // Ana has none: the Saldo is the same as before the caixinha existed.
    const without = await load("balance", ana, "2026-10");
    expect(without.props.savingsBoxCents).toBeNull();

    const { db } = await import("@/server/db/client");
    const schema = await import("@/server/db/schema");
    await db
      .insert(schema.user)
      .values({ id: "dora", name: "Dora", email: "dora@exemplo.com" });
    const checking = await accounts.createAccount("dora", {
      name: "Conta",
      type: "checking",
      initialBalanceCents: 100_000,
    });
    const box = await accounts.createAccount("dora", {
      name: "Caixinha",
      type: "savings_box",
      initialBalanceCents: 0,
    });
    const dora = await context.getUserContext("dora", { now: NOW });
    await transactions.createTransfer(dora, {
      fromAccountId: checking,
      toAccountId: box,
      amountCents: 10_000,
      occurredOn: "2026-10-14",
    });

    const { type, props } = await load("balance", dora, "2026-10");
    expect(type).toBe(components.balance.BalanceHero);
    expect(props).toMatchObject({
      balanceCents: 90_000,
      monthChangeCents: -10_000,
      savingsBoxCents: 10_000,
    });
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(
      (await blocks.HOME_BLOCK_LOADERS.balance({
        ctx: dora,
        range: context.resolvePeriod(dora, "2026-10"),
      })) as ReactElement,
    ).replaceAll(" ", " ");
    expect(html).toContain("Guardado em caixinhas");
    expect(html).toContain("100,00");
  });

  it("keeps the caixinha of another person out", async () => {
    const { props } = await load("balance", bia, "2026-10");
    expect(props.savingsBoxCents).toBeNull();
  });
});

describe("Quanto dá para gastar por dia", () => {
  type Spendable = import("@/server/domain/dashboard").SpendablePerDay;

  async function loadSpendable(ctx: UserContext, month: string) {
    const range = context.resolvePeriod(ctx, month);
    const element = (await blocks.HOME_BLOCK_LOADERS["daily-spend"]({
      ctx,
      range,
    })) as ReactElement<Props>;
    return { type: element.type, props: element.props };
  }

  it("lists the days left of today's month, counted to its last day", async () => {
    const { type, props } = await loadSpendable(ana, "2026-10");
    expect(type).toBe(components.spendable.SpendablePerDayBlock);
    expect(props).toMatchObject({ today: "2026-10-14", isCurrent: true });
    const spendable = props.spendable as Spendable;
    expect(spendable.until).toBe("2026-10-31");
    // 14/out to 31/out is 18 days: the first 14 are listed.
    expect(spendable.rows).toHaveLength(14);
    expect(spendable.rows[0]).toMatchObject({
      date: "2026-10-14",
      daysLeft: 18,
    });
    expect(spendable.rows.at(-1)).toMatchObject({
      date: "2026-10-27",
      daysLeft: 5,
    });
  });

  it("counts the rent and the invoice due before the end of the month", async () => {
    const { props } = await loadSpendable(ana, "2026-10");
    const { rows } = props.spendable as Spendable;
    // The Saldo previsto of the month's end is what today's balance leaves
    // after the rent (15/out) and the card's invoice (25/out): well under it.
    const { getBalanceSummary } = await import("@/server/domain/dashboard");
    const summary = await getBalanceSummary(
      ana,
      context.resolvePeriod(ana, "2026-10"),
    );
    expect(rows[0]?.perDayCents).toBeLessThanOrEqual(
      Math.floor(summary.balanceCents / 18),
    );
    expect(rows[0]?.perDayCents).toBeGreaterThan(0);
  });

  it("shows the same days in another month, saying where it starts", async () => {
    const current = await loadSpendable(ana, "2026-10");
    for (const month of ["2026-09", "2026-12"]) {
      const other = await loadSpendable(ana, month);
      expect(other.type).toBe(components.spendable.SpendablePerDayBlock);
      expect(other.props.isCurrent).toBe(false);
      expect(other.props.spendable).toEqual(current.props.spendable);
    }
  });

  it("invites without an account off the cards and caixinhas", async () => {
    const none = await loadSpendable(caio, "2026-10");
    expect(none.type).toBe(
      components.spendable.SpendablePerDayNoAccountsInvite,
    );
  });

  it("gives each account its own days", async () => {
    // Bia's account is empty: nothing to spend, whatever Ana has.
    const { props } = await loadSpendable(bia, "2026-10");
    const spendable = props.spendable as Spendable;
    expect(spendable.rows.every((row) => row.perDayCents === 0)).toBe(true);
    expect(spendable.shortfallCents).toBe(0);
  });

  it("ignores the budget: each day is the balance over the days left", async () => {
    const { db } = await import("@/server/db/client");
    const schema = await import("@/server/db/schema");
    const { listCategories } = await import("@/server/domain/categories");
    const { upsertBudget } = await import("@/server/domain/budgets");
    const market = (await listCategories("ana")).find(
      (item) => item.name === "Mercado",
    );
    if (!market) throw new Error("categoria Mercado");
    const before = (await loadSpendable(ana, "2026-10")).props.spendable;
    await upsertBudget(ana, {
      categoryId: market.id,
      month: "2026-10",
      amountCents: 1_000,
    });
    try {
      for (const store of memo.stores) store.clear();
      const { props } = await loadSpendable(ana, "2026-10");
      const spendable = props.spendable as Spendable;
      expect(spendable).toEqual(before);
      expect(spendable).not.toHaveProperty("hasBudget");
      expect(spendable).not.toHaveProperty("budgetMonth");
      expect(spendable.rows[0]).not.toHaveProperty("cappedByBudget");
      const row = spendable.rows[0];
      expect(row?.perDayCents).toBeGreaterThan(1_000 / 18);
    } finally {
      await db.delete(schema.budgets).where(eq(schema.budgets.userId, "ana"));
    }
  });
});

describe("Próximas contas: vencimento em dia não útil", () => {
  // Today is Wednesday 14/out/2026: the Condomínio falls on Saturday 17/out.
  type Item = import("@/server/domain/dashboard").UpcomingItem;
  let dani: UserContext;
  let eli: UserContext;

  beforeAll(async () => {
    const { db } = await import("@/server/db/client");
    const schema = await import("@/server/db/schema");
    const { ensureOwnerDefaults } = await import("@/server/db/seed-defaults");
    const { listCategories } = await import("@/server/domain/categories");
    await db.insert(schema.user).values([
      { id: "dani", name: "Dani", email: "dani@exemplo.com" },
      { id: "eli", name: "Eli", email: "eli@exemplo.com" },
    ]);
    // Dani has the flag; Eli does not.
    await db.insert(schema.featureFlagOverrides).values({
      userId: "dani",
      key: "alerta_dia_nao_util",
      enabled: true,
    });
    dani = await context.getUserContext("dani", { now: NOW });
    eli = await context.getUserContext("eli", { now: NOW });
    for (const [id, ctx] of [
      ["dani", dani],
      ["eli", eli],
    ] as const) {
      await ensureOwnerDefaults(id);
      const accountId = await accounts.createAccount(id, {
        name: "Conta principal",
        type: "checking",
        initialBalanceCents: 100_000,
      });
      const category = (await listCategories(id)).find(
        (item) => item.name === "Moradia",
      );
      if (!category) throw new Error("categoria Moradia");
      for (const [description, occurredOn] of [
        ["Condomínio", "2026-10-17"],
        ["Escola", "2026-10-16"],
      ] as const) {
        await transactions.createTransaction(ctx, {
          kind: "expense",
          amountCents: 68_000,
          accountId,
          categoryId: category.id,
          description,
          occurredOn,
          paid: false,
        });
      }
    }
  });

  async function upcoming(ctx: UserContext): Promise<Item[]> {
    for (const store of memo.stores) store.clear();
    const range = context.resolvePeriod(ctx, "2026-10");
    const element = (await blocks.HOME_BLOCK_LOADERS["upcoming-bills"]({
      ctx,
      range,
    })) as ReactElement<{ children: ReactElement<{ items: Item[] }>[] }>;
    const list = [element.props.children].flat().at(-1);
    return list?.props.items ?? [];
  }

  it("annotates the Saturday bill with the next business day when the flag is on", async () => {
    const items = await upcoming(dani);
    const condo = items.find((item) => item.title === "Condomínio");
    expect(condo?.nonBusinessDue).toMatchObject({
      reason: "saturday",
      nextBusinessDay: "2026-10-19",
      previousBusinessDay: "2026-10-16",
    });
    // A Friday bill is a business day: no note.
    expect(
      items.find((item) => item.title === "Escola")?.nonBusinessDue,
    ).toBeUndefined();
  });

  it("annotates nothing when the flag is off, and never reads another person's bills", async () => {
    const items = await upcoming(eli);
    expect(items.map((item) => item.title).sort()).toEqual([
      "Condomínio",
      "Escola",
    ]);
    expect(items.every((item) => item.nonBusinessDue === undefined)).toBe(true);
    const danis = await upcoming(dani);
    expect(danis.map((item) => item.title).sort()).toEqual([
      "Condomínio",
      "Escola",
    ]);
  });
});

describe("Quanto dá para gastar por conta", () => {
  // Gil: a checking account and a wallet to spend from, a caixinha, card A
  // paid from the checking account and card B with no paying account.
  type Spendable = import("@/server/domain/dashboard").SpendablePerDay;
  let gil: UserContext;
  const gilIds = {} as Record<
    "checking" | "wallet" | "box" | "cardA" | "cardB" | "theirs",
    string
  >;

  async function spendableOf(ctx: UserContext): Promise<Spendable> {
    for (const store of memo.stores) store.clear();
    const element = (await blocks.HOME_BLOCK_LOADERS["daily-spend"]({
      ctx,
      range: context.resolvePeriod(ctx, "2026-10"),
    })) as ReactElement<Props>;
    return element.props.spendable as Spendable;
  }

  beforeAll(async () => {
    const { db } = await import("@/server/db/client");
    const schema = await import("@/server/db/schema");
    const { ensureOwnerDefaults } = await import("@/server/db/seed-defaults");
    const { listInvoices, payInvoice } = await import("@/server/domain/cards");
    await db.insert(schema.user).values([
      { id: "gil", name: "Gil", email: "gil@exemplo.com" },
      { id: "hal", name: "Hal", email: "hal@exemplo.com" },
    ]);
    await ensureOwnerDefaults("gil");
    gil = await context.getUserContext("gil", { now: NOW });
    const account = (
      name: string,
      type: "checking" | "cash" | "savings_box",
      initialBalanceCents: number,
    ) => accounts.createAccount("gil", { name, type, initialBalanceCents });
    gilIds.checking = await account("Conta principal", "checking", 300_000);
    gilIds.wallet = await account("Carteira", "cash", 50_000);
    gilIds.box = await account("Caixinha", "savings_box", 100_000);
    const card = (name: string, paymentAccountId?: string) =>
      accounts.createAccount("gil", {
        name,
        type: "credit_card",
        initialBalanceCents: 0,
        card: {
          limitCents: 500_000,
          closingDay: 17,
          dueDay: 25,
          paymentAccountId,
        },
      });
    gilIds.cardA = await card("Cartão A", gilIds.checking);
    gilIds.cardB = await card("Cartão B");
    gilIds.theirs = await accounts.createAccount("hal", {
      name: "Conta do Hal",
      type: "checking",
      initialBalanceCents: 0,
    });
    // Both invoices are due on 25/out.
    for (const [accountId, amountCents] of [
      [gilIds.cardA, 40_000],
      [gilIds.cardB, 20_000],
    ] as const) {
      await transactions.createTransaction(gil, {
        kind: "expense",
        amountCents,
        accountId,
        categoryId: null,
        description: "Compra",
        occurredOn: "2026-10-10",
      });
    }
    // From the checking account to the wallet on 20/out.
    await transactions.createTransfer(gil, {
      fromAccountId: gilIds.checking,
      toAccountId: gilIds.wallet,
      amountCents: 10_000,
      occurredOn: "2026-10-20",
    });
    // Part of card B's invoice scheduled from the caixinha.
    const [invoiceB] = await listInvoices(gil, gilIds.cardB);
    if (!invoiceB) throw new Error("fatura do cartão B");
    await payInvoice(gil, {
      invoiceId: invoiceB.id,
      fromAccountId: gilIds.box,
      amountCents: 5_000,
      occurredOn: "2026-10-22",
    });
  });

  it("adds up, account by account, to the forecast of the Fluxo", async () => {
    for (const store of memo.stores) store.clear();
    const { spendableAccountInputs } = await import(
      "@/server/domain/dashboard"
    );
    const { spendableAccountSeries, parse } = await import("@/lib/finance");
    const current = context.resolvePeriod(gil, null);
    const inputs = await spendableAccountInputs(gil, current);
    const series = spendableAccountSeries({
      ...inputs,
      today: gil.today,
      until: parse(current.end),
    });
    const { cashFlowReport } = await import("@/server/domain/reports");
    const report = await cashFlowReport(gil, current);
    const ahead = report.days.filter((day) => day.date >= gil.todayIso);
    expect(ahead).toHaveLength(series.unassignedDays.length);
    ahead.forEach((day, k) => {
      const sum =
        series.accounts.reduce(
          (total, item) => total + (item.days[k]?.projectedCents ?? 0),
          0,
        ) + (series.unassignedDays[k]?.projectedCents ?? 0);
      expect(sum, day.date).toBe(day.projectedCents);
    });
    // Card B: the 5.000 scheduled from the caixinha and the 15.000 nobody pays.
    expect(series.unassignedDays.at(-1)?.projectedCents).toBe(-20_000);
  });

  it("charges card A to the checking account and moves the transfer", async () => {
    const spendable = await spendableOf(gil);
    expect(spendable.accounts.map((item) => [item.name, item.shown])).toEqual([
      ["Conta principal", true],
      ["Carteira", true],
    ]);
    // 14/out to 31/out: 18 days. The total counts both invoices.
    const [today] = spendable.rows;
    expect(today?.perDayCents).toBe(Math.floor(290_000 / 18));
    expect(today?.byAccount).toEqual([
      // 300.000 − 10.000 to the wallet − the 40.000 of card A.
      { accountId: gilIds.checking, perDayCents: Math.floor(250_000 / 18) },
      // Its lowest is before the transfer comes in.
      { accountId: gilIds.wallet, perDayCents: Math.floor(50_000 / 18) },
    ]);
    // From 20/out on (12 days), the wallet has the transfer too.
    const twentieth = spendable.rows.find((row) => row.date === "2026-10-20");
    expect(twentieth?.byAccount[1]?.perDayCents).toBe(Math.floor(60_000 / 12));
    expect(spendable.unassignedCards).toEqual([
      { id: gilIds.cardB, name: "Cartão B" },
    ]);
  });

  it("keeps the caixinha and the cards out of the lines", async () => {
    const spendable = await spendableOf(gil);
    const listed = spendable.accounts.map((item) => item.id);
    expect(listed).not.toContain(gilIds.box);
    expect(listed).not.toContain(gilIds.cardA);
  });

  it("leaves the hidden accounts out of the lines, the total as it was", async () => {
    const { setDailySpendHidden } = await import("@/server/domain/preferences");
    const before = await spendableOf(gil);
    await setDailySpendHidden("gil", [gilIds.wallet]);
    try {
      const spendable = await spendableOf(gil);
      expect(spendable.accounts.map((item) => [item.id, item.shown])).toEqual([
        [gilIds.checking, true],
        [gilIds.wallet, false],
      ]);
      expect(
        spendable.rows[0]?.byAccount.map((item) => item.accountId),
      ).toEqual([gilIds.checking]);
      expect(spendable.rows.map((row) => row.perDayCents)).toEqual(
        before.rows.map((row) => row.perDayCents),
      );
    } finally {
      await setDailySpendHidden("gil", []);
    }
  });

  it("ignores an account of another person in what was saved", async () => {
    const { db } = await import("@/server/db/client");
    const schema = await import("@/server/db/schema");
    await db
      .update(schema.userSettings)
      .set({
        homeBlockSettings: {
          "daily-spend": { hiddenAccountIds: [gilIds.theirs] },
        },
      })
      .where(eq(schema.userSettings.userId, "gil"));
    try {
      const spendable = await spendableOf(gil);
      expect(spendable.accounts.every((item) => item.shown)).toBe(true);
      expect(spendable.accounts.map((item) => item.id)).not.toContain(
        gilIds.theirs,
      );
    } finally {
      await db
        .update(schema.userSettings)
        .set({ homeBlockSettings: null })
        .where(eq(schema.userSettings.userId, "gil"));
    }
  });

  it("has no lines with a single account to spend from", async () => {
    const spendable = await spendableOf(ana);
    expect(spendable.accounts).toEqual([]);
    expect(spendable.unassignedCards).toEqual([]);
    expect(spendable.rows.every((row) => row.byAccount.length === 0)).toBe(
      true,
    );
  });

  // Last: it pays part of the invoice of card B.
  it("charges a card with no paying account to the one that paid it last", async () => {
    const { listInvoices, payInvoice } = await import("@/server/domain/cards");
    const [invoiceB] = await listInvoices(gil, gilIds.cardB);
    if (!invoiceB) throw new Error("fatura do cartão B");
    await payInvoice(gil, {
      invoiceId: invoiceB.id,
      fromAccountId: gilIds.wallet,
      amountCents: 1_000,
      occurredOn: "2026-10-12",
    });
    const spendable = await spendableOf(gil);
    // The wallet: 49.000, + 10.000 on 20/out, − the 14.000 left of card B
    // (19.000 owed, 5.000 of it scheduled from the caixinha) on 25/out.
    expect(spendable.rows[0]?.byAccount[1]).toEqual({
      accountId: gilIds.wallet,
      perDayCents: Math.floor(45_000 / 18),
    });
    // The part of the caixinha still counts only in the total.
    expect(spendable.unassignedCards.map((item) => item.id)).toEqual([
      gilIds.cardB,
    ]);
  });
});

describe("Quanto dá para gastar por dia com benefício", () => {
  // Ivo: one checking account and a vale-refeição out of the net worth.
  type Spendable = import("@/server/domain/dashboard").SpendablePerDay;
  let ivo: UserContext;
  const ivoIds = {} as Record<"checking" | "vr", string>;

  async function spendableOf(ctx: UserContext): Promise<Spendable> {
    for (const store of memo.stores) store.clear();
    const element = (await blocks.HOME_BLOCK_LOADERS["daily-spend"]({
      ctx,
      range: context.resolvePeriod(ctx, "2026-10"),
    })) as ReactElement<Props>;
    return element.props.spendable as Spendable;
  }

  beforeAll(async () => {
    const { db } = await import("@/server/db/client");
    const schema = await import("@/server/db/schema");
    await db
      .insert(schema.user)
      .values({ id: "ivo", name: "Ivo", email: "ivo@exemplo.com" });
    ivo = await context.getUserContext("ivo", { now: NOW });
    ivoIds.checking = await accounts.createAccount("ivo", {
      name: "Conta principal",
      type: "checking",
      initialBalanceCents: 90_000,
    });
  });

  it("gives the benefício its own line, the total as it was", async () => {
    const before = await spendableOf(ivo);
    expect(before.accounts).toEqual([]);
    ivoIds.vr = await accounts.createAccount("ivo", {
      name: "Vale-refeição",
      type: "benefit",
      initialBalanceCents: 36_000,
    });
    const after = await spendableOf(ivo);
    expect(after.rows.map((row) => row.perDayCents)).toEqual(
      before.rows.map((row) => row.perDayCents),
    );
    expect(after.shortfallCents).toBe(before.shortfallCents);
    expect(after.accounts.map((item) => [item.name, item.shown])).toEqual([
      ["Vale-refeição", true],
    ]);
    // 36.000 over the 18 days left.
    expect(after.rows[0]?.byAccount).toEqual([
      { accountId: ivoIds.vr, perDayCents: 2_000 },
    ]);
  });
});

describe("Maior gasto da semana", () => {
  type Item = import("@/server/domain/dashboard").TopExpense;

  async function loadTop(ctx: UserContext) {
    const element = (await blocks.HOME_BLOCK_LOADERS["top-expenses"]({
      ctx,
      range: context.resolvePeriod(ctx, "2026-10"),
    })) as ReactElement<Props>;
    return { type: element.type, props: element.props };
  }

  it("shows the biggest paid expenses of the last 7 days, the header going to the expenses", async () => {
    const { type, props } = await loadTop(ana);
    expect(type).toBe(components.topExpenses.TopExpensesBlock);
    expect(props).toMatchObject({
      today: "2026-10-14",
      extractHref: "/extrato?tipo=despesa",
    });
    const items = props.items as Item[];
    // The 14/out entries only: the rent of the 15th is pending, September is out.
    expect(items.map((item) => item.description)).toEqual([
      "Supermercado",
      "Corrida",
    ]);
  });

  it("opens each row on the statement of its month, narrowed to the entry", async () => {
    const { props } = await loadTop(ana);
    const hrefFor = props.hrefFor as (item: Item) => string;
    const [first] = props.items as Item[];
    if (!first) throw new Error("sem item");
    // The month on screen is October: no `mes` in the link.
    expect(hrefFor(first)).toBe(
      `/extrato?conta=${first.accountId}&tipo=despesa&q=Supermercado`,
    );
  });

  it("names the month of the entry when the week crosses the turn of the financial month", async () => {
    const { db } = await import("@/server/db/client");
    const schema = await import("@/server/db/schema");
    await db
      .insert(schema.user)
      .values({ id: "duda", name: "Duda", email: "duda@exemplo.com" });
    const account = await accounts.createAccount("duda", {
      name: "Conta",
      type: "checking",
      initialBalanceCents: 0,
    });
    const base = await context.getUserContext("duda", { now: NOW });
    // The financial month starts on the 14th: 13/out belongs to September's.
    const duda = { ...base, monthStartDay: 14 };
    for (const [amountCents, occurredOn] of [
      [9_000, "2026-10-13"],
      [8_000, "2026-10-14"],
    ] as const) {
      await transactions.createTransaction(duda, {
        kind: "expense",
        accountId: account,
        categoryId: null,
        amountCents,
        occurredOn,
        description: "Feira",
      });
    }
    const { props } = await loadTop(duda);
    const hrefFor = props.hrefFor as (item: Item) => string;
    const [before, after] = props.items as Item[];
    if (!before || !after) throw new Error("sem itens");
    expect(hrefFor(before)).toContain("mes=2026-09");
    expect(hrefFor(after)).not.toContain("mes=");
  });

  it("invites without an expense in the 7 days, and never reads another person's", async () => {
    const empty = await loadTop(bia);
    expect(empty.type).toBe(components.topExpenses.TopExpensesInvite);
    const none = await loadTop(caio);
    expect(none.type).toBe(components.topExpenses.TopExpensesInvite);
  });
});

describe("Parcelas a terminar", () => {
  type Item = import("@/lib/home/installments-ending").EndingInstallment;

  async function loadEnding(ctx: UserContext) {
    const element = (await blocks.HOME_BLOCK_LOADERS["installments-ending"]({
      ctx,
      range: context.resolvePeriod(ctx, "2026-10"),
    })) as ReactElement<Props>;
    return { type: element.type, props: element.props };
  }

  async function buyInstallments(
    ctx: UserContext,
    accountId: string,
    description: string,
    occurredOn: string,
  ) {
    await transactions.createTransaction(ctx, {
      kind: "expense",
      accountId,
      categoryId: null,
      amountCents: 30_000,
      occurredOn,
      description,
      installments: 3,
    });
  }

  it("lists the purchases with something left, each row opening the statement of its next installment", async () => {
    const { db } = await import("@/server/db/client");
    const schema = await import("@/server/db/schema");
    await db
      .insert(schema.user)
      .values({ id: "nair", name: "Nair", email: "nair@exemplo.com" });
    const account = await accounts.createAccount("nair", {
      name: "Conta",
      type: "checking",
      initialBalanceCents: 0,
    });
    const nair = await context.getUserContext("nair", { now: NOW });
    await buyInstallments(nair, account, "Sofá", "2026-10-20");
    const { type, props } = await loadEnding(nair);
    expect(type).toBe(components.installmentsEnding.InstallmentsEndingBlock);
    const summary = props.summary as {
      items: Item[];
      totalPlans: number;
      monthlyCents: number;
    };
    expect(summary.totalPlans).toBe(1);
    expect(summary.monthlyCents).toBe(10_000);
    const hrefFor = props.hrefFor as (item: Item) => string;
    const [first] = summary.items;
    if (!first) throw new Error("sem item");
    // The next installment is on 20/out: the month on screen, no `mes`.
    expect(hrefFor(first)).toBe(
      `/extrato?conta=${account}&tipo=despesa&status=pendente&q=Sof%C3%A1`,
    );
  });

  it("names the month of the next installment when it is not the one on screen", async () => {
    const { db } = await import("@/server/db/client");
    const schema = await import("@/server/db/schema");
    await db
      .insert(schema.user)
      .values({ id: "fred", name: "Fred", email: "fred@exemplo.com" });
    const account = await accounts.createAccount("fred", {
      name: "Conta",
      type: "checking",
      initialBalanceCents: 0,
    });
    const fred = await context.getUserContext("fred", { now: NOW });
    await buyInstallments(fred, account, "Mesa", "2026-11-20");
    const { props } = await loadEnding(fred);
    const hrefFor = props.hrefFor as (item: Item) => string;
    const [first] = (props.summary as { items: Item[] }).items;
    if (!first) throw new Error("sem item");
    expect(hrefFor(first)).toContain("mes=2026-11");
  });

  it("invites without a pending installment, and never reads another person's", async () => {
    const empty = await loadEnding(bia);
    expect(empty.type).toBe(
      components.installmentsEnding.InstallmentsEndingInvite,
    );
    const none = await loadEnding(caio);
    expect(none.type).toBe(
      components.installmentsEnding.InstallmentsEndingInvite,
    );
    // Ana has installments? No: and Nair's/Fred's do not leak into her.
    const ana1 = await loadEnding(ana);
    expect(ana1.type).toBe(
      components.installmentsEnding.InstallmentsEndingInvite,
    );
  });
});
