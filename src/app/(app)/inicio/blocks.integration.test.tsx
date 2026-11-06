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
  cashFlow: typeof import("@/components/dashboard/cash-flow-block");
  categories: typeof import("@/components/dashboard/category-breakdown-block");
  incomeExpense: typeof import("@/components/dashboard/income-expense-block");
  netWorth: typeof import("@/components/dashboard/net-worth-block");
  noRecords: typeof import("@/components/dashboard/block-no-records");
};

// 14/out/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);

type Props = Record<string, unknown>;

/** What a block's loader renders for a month (`YYYY-MM`). */
async function load(
  id: "cash-flow" | "category-breakdown" | "income-expense" | "net-worth",
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
  components.cashFlow = await import("@/components/dashboard/cash-flow-block");
  components.categories = await import(
    "@/components/dashboard/category-breakdown-block"
  );
  components.incomeExpense = await import(
    "@/components/dashboard/income-expense-block"
  );
  components.netWorth = await import("@/components/dashboard/net-worth-block");
  components.noRecords = await import(
    "@/components/dashboard/block-no-records"
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
