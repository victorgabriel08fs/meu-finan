// Merging categories, archiving with "Passar para", the order of the lists
// and the category detail (doc 02 §6.12, §6.14; doc 03 §11, §12), against a
// real (in-memory) Postgres on 14/out/2026. Every move takes entries of any
// status (deleted ones too), recurrences, rules and budgets, and nothing of
// anyone else's.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  admin: typeof import("./category-admin");
  budgets: typeof import("./budgets");
  categories: typeof import("./categories");
  context: typeof import("./context");
  moves: typeof import("./category-moves");
  recurrences: typeof import("./recurrences");
  report: typeof import("./category-report");
  reports: typeof import("./reports");
  transactions: typeof import("./transactions");
};
type Db = typeof import("../db/client").db;
type Schema = typeof import("../db/schema");
type Who = "ana" | "bruno" | "carla" | "dani";

let d: Domain;
let db: Db;
let s: Schema;
let orm: typeof import("drizzle-orm");
const ctx = {} as Record<Who, import("./context").UserContext>;
const wallet = {} as Record<Who, string>;

// 14/out/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  db = (await import("../db/client")).db;
  await migrate(db as never, { migrationsFolder: "drizzle" });
  s = await import("../db/schema");
  orm = await import("drizzle-orm");
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  d = {
    accounts: await import("./accounts"),
    admin: await import("./category-admin"),
    budgets: await import("./budgets"),
    categories: await import("./categories"),
    context: await import("./context"),
    moves: await import("./category-moves"),
    recurrences: await import("./recurrences"),
    report: await import("./category-report"),
    reports: await import("./reports"),
    transactions: await import("./transactions"),
  };
  for (const who of ["ana", "bruno", "carla", "dani"] as const) {
    await db
      .insert(s.user)
      .values({ id: who, name: who, email: `${who}@exemplo.com` });
    await ensureOwnerDefaults(who);
    ctx[who] = await d.context.getUserContext(who, { now: NOW });
    wallet[who] = await d.accounts.createAccount(who, {
      name: "Carteira",
      type: "cash",
      initialBalanceCents: 0,
    });
  }
}, 120_000);

let counter = 0;
/** A new category with a name no other test uses. */
function category(
  who: Who,
  name: string,
  options: { parentId?: string; kind?: "income" | "expense" } = {},
) {
  counter += 1;
  return d.categories.createCategory(who, {
    kind: options.kind ?? "expense",
    name: `${name} ${counter}`,
    icon: "carrot",
    color: "cat-1",
    parentId: options.parentId ?? null,
  });
}

async function spend(
  who: Who,
  categoryId: string,
  amountCents: number,
  occurredOn: string,
  extra: Partial<import("./transactions").TransactionInput> = {},
) {
  const { ids } = await d.transactions.createTransaction(ctx[who], {
    kind: "expense",
    amountCents,
    accountId: wallet[who],
    categoryId,
    description: "Compra",
    occurredOn,
    ...extra,
  });
  return ids;
}

/** Every entry of a category, deleted ones included. */
async function entriesOf(categoryId: string) {
  const { eq } = orm;
  return db
    .select({
      id: s.transactions.id,
      status: s.transactions.status,
      deletedAt: s.transactions.deletedAt,
      installmentNumber: s.transactions.installmentNumber,
      recurrenceId: s.transactions.recurrenceId,
    })
    .from(s.transactions)
    .where(eq(s.transactions.categoryId, categoryId));
}

async function budgetsOf(categoryId: string) {
  const { asc, eq } = orm;
  return db
    .select({
      month: s.budgets.month,
      amountCents: s.budgets.amountCents,
      rollover: s.budgets.rollover,
    })
    .from(s.budgets)
    .where(eq(s.budgets.categoryId, categoryId))
    .orderBy(asc(s.budgets.month));
}

async function row(id: string) {
  const { eq } = orm;
  const [found] = await db
    .select({
      parentId: s.categories.parentId,
      sortOrder: s.categories.sortOrder,
      archivedAt: s.categories.archivedAt,
    })
    .from(s.categories)
    .where(eq(s.categories.id, id));
  if (!found) throw new Error(`categoria ${id}`);
  return found;
}

/** A budget straight in the table (an old one on a subcategory, a rollover). */
async function budget(
  who: Who,
  categoryId: string,
  month: string,
  amountCents: number,
  rollover = false,
) {
  await db.insert(s.budgets).values({
    userId: who,
    categoryId,
    month: `${month}-01`,
    amountCents,
    rollover,
  });
}

async function seed(who: Who, name: string) {
  const found = (await d.categories.listCategories(who)).find(
    (item) => item.name === name,
  );
  if (!found) throw new Error(name);
  return found.id;
}

describe("mergeCategories", () => {
  it("moves paid, scheduled, deleted entries, installments, recurrences, rules and budgets; the source stays archived and empty", async () => {
    const source = await category("ana", "Supermercado");
    const target = await category("ana", "Alimentação");
    await spend("ana", source, 1_000, "2026-10-02");
    await spend("ana", source, 2_000, "2026-10-25", { paid: false });
    const [deleted] = await spend("ana", source, 9_900, "2026-10-03");
    if (!deleted) throw new Error("lançamento");
    await d.transactions.deleteTransaction(ctx.ana, deleted);
    await spend("ana", source, 3_000, "2026-10-05", { installments: 3 });
    await spend("ana", source, 500, "2026-10-10", {
      recurrence: { freq: "monthly" },
    });
    await db.insert(s.categorizationRules).values({
      userId: "ana",
      pattern: "supermercado do bairro",
      categoryId: source,
    });
    await budget("ana", source, "2026-09", 10_000, true);
    await budget("ana", source, "2026-10", 20_000);
    await budget("ana", target, "2026-10", 50_000, false);
    const before = await entriesOf(source);
    const visible = before.filter((item) => item.deletedAt === null).length;
    expect(
      before.filter((item) => item.installmentNumber !== null),
    ).toHaveLength(3);
    expect(before.some((item) => item.status === "pending")).toBe(true);

    const result = await d.moves.mergeCategories("ana", source, target);
    expect(result).toMatchObject({ entries: visible, children: 0 });
    expect(result.name).toMatch(/^Supermercado/);
    expect(result.into).toMatch(/^Alimentação/);

    expect(await entriesOf(source)).toEqual([]);
    const moved = await entriesOf(target);
    expect(moved.map((item) => item.id).sort()).toEqual(
      before.map((item) => item.id).sort(),
    );
    // The deleted one moved too: its Desfazer brings it back in the target.
    await d.transactions.restoreTransactions(ctx.ana, [deleted]);
    expect(
      (await entriesOf(target)).find((item) => item.id === deleted)?.deletedAt,
    ).toBeNull();

    const { eq } = orm;
    const [rule] = await db
      .select({ categoryId: s.categorizationRules.categoryId })
      .from(s.categorizationRules)
      .where(eq(s.categorizationRules.pattern, "supermercado do bairro"));
    expect(rule?.categoryId).toBe(target);
    const rules = await db
      .select({ categoryId: s.recurrences.categoryId })
      .from(s.recurrences)
      .where(eq(s.recurrences.userId, "ana"));
    expect(rules.map((item) => item.categoryId)).toContain(target);
    expect(rules.map((item) => item.categoryId)).not.toContain(source);

    // Summed month by month; the target's own rollover stays, a new month
    // takes the source's.
    expect(await budgetsOf(target)).toEqual([
      { month: "2026-09-01", amountCents: 10_000, rollover: true },
      { month: "2026-10-01", amountCents: 70_000, rollover: false },
    ]);
    expect(await budgetsOf(source)).toEqual([]);

    // Archived, not deleted: the name stays taken at its level.
    expect((await row(source)).archivedAt).not.toBeNull();

    // The job creates the next occurrences in the target.
    await d.recurrences.materializeRecurrences({ now: NOW + 90 * DAY });
    const later = (await entriesOf(target)).filter(
      (item) => item.recurrenceId !== null,
    );
    expect(later.length).toBeGreaterThan(
      moved.filter((item) => item.recurrenceId !== null).length,
    );
    expect(await entriesOf(source)).toEqual([]);
  });

  it("a main category into another: its subcategories move along, their entries stay with them", async () => {
    const source = await category("ana", "Casa");
    const target = await category("ana", "Moradia");
    const cleaning = await category("ana", "Limpeza", { parentId: source });
    const garden = await category("ana", "Jardim", { parentId: source });
    await spend("ana", source, 1_000, "2026-10-02");
    await spend("ana", cleaning, 2_000, "2026-10-02");
    await d.admin.setCategoryArchived("ana", garden, true);

    const result = await d.moves.mergeCategories("ana", source, target);
    expect(result).toMatchObject({ entries: 1, children: 2 });
    expect(await row(cleaning)).toMatchObject({
      parentId: target,
      sortOrder: 999,
      archivedAt: null,
    });
    // An archived subcategory moves too, still archived.
    expect((await row(garden)).parentId).toBe(target);
    expect((await row(garden)).archivedAt).not.toBeNull();
    expect(await entriesOf(cleaning)).toHaveLength(1);
    expect(await entriesOf(target)).toHaveLength(1);
    expect((await row(source)).archivedAt).not.toBeNull();
  });

  it("a subcategory into its own main category, its old budget added to it", async () => {
    const parent = await category("ana", "Lazer");
    const fair = await category("ana", "Cinema", { parentId: parent });
    await spend("ana", fair, 1_500, "2026-10-02");
    await budget("ana", fair, "2026-10", 3_000);
    await budget("ana", parent, "2026-10", 10_000);

    const result = await d.moves.mergeCategories("ana", fair, parent);
    expect(result.entries).toBe(1);
    expect(await entriesOf(parent)).toHaveLength(1);
    expect(await budgetsOf(parent)).toEqual([
      { month: "2026-10-01", amountCents: 13_000, rollover: false },
    ]);
    expect(await budgetsOf(fair)).toEqual([]);
  });

  it("into a subcategory: the budget goes to its main category", async () => {
    const parent = await category("ana", "Pets");
    const food = await category("ana", "Ração", { parentId: parent });
    const source = await category("ana", "Petshop");
    await budget("ana", source, "2026-11", 4_000);

    const result = await d.moves.mergeCategories("ana", source, food);
    expect(result.into).toMatch(/^Pets \d+ › Ração/);
    expect(await budgetsOf(food)).toEqual([]);
    expect(await budgetsOf(parent)).toEqual([
      { month: "2026-11-01", amountCents: 4_000, rollover: false },
    ]);
  });

  it("refuses a category with subcategories into a subcategory", async () => {
    const source = await category("ana", "Viagem");
    await category("ana", "Hotel", { parentId: source });
    const parent = await category("ana", "Férias");
    const child = await category("ana", "Praia", { parentId: parent });
    await expect(d.moves.mergeCategories("ana", source, child)).rejects.toThrow(
      /tem subcategorias: escolha uma categoria principal/,
    );
    expect((await row(source)).archivedAt).toBeNull();
  });

  it("refuses a subcategory name already under the target, archived ones too, changing nothing", async () => {
    const source = await category("ana", "Feiras");
    const target = await category("ana", "Sacolão");
    await d.categories.createCategory("ana", {
      kind: "expense",
      name: "Orgânicos",
      icon: "carrot",
      color: "cat-1",
      parentId: source,
    });
    const clash = await d.categories.createCategory("ana", {
      kind: "expense",
      name: "Orgânicos",
      icon: "carrot",
      color: "cat-1",
      parentId: target,
    });
    await d.admin.setCategoryArchived("ana", clash, true);
    await spend("ana", source, 1_000, "2026-10-02");

    await expect(
      d.moves.mergeCategories("ana", source, target),
    ).rejects.toThrow(
      /^Sacolão \d+ já tem uma subcategoria Orgânicos\. Renomeie uma das duas antes de mesclar\.$/,
    );
    expect(await entriesOf(source)).toHaveLength(1);
    expect((await row(source)).archivedAt).toBeNull();
  });

  it("says why other targets cannot take it, and never touches someone else's", async () => {
    const source = await category("ana", "Diversos");
    await spend("ana", source, 1_000, "2026-10-02");
    const archived = await category("ana", "Antiga");
    await d.admin.setCategoryArchived("ana", archived, true);
    const income = await category("ana", "Bônus", { kind: "income" });
    const brunoMarket = await seed("bruno", "Mercado");
    await spend("bruno", brunoMarket, 7_000, "2026-10-02");
    const brunoBefore = await entriesOf(brunoMarket);

    await expect(
      d.moves.mergeCategories("ana", source, source),
    ).rejects.toThrow("Escolha outra categoria.");
    await expect(
      d.moves.mergeCategories("ana", source, income),
    ).rejects.toThrow("Escolha uma categoria de despesa.");
    await expect(
      d.moves.mergeCategories("ana", source, archived),
    ).rejects.toThrow("Esta categoria está arquivada.");
    await expect(
      d.moves.mergeCategories("ana", source, brunoMarket),
    ).rejects.toThrow("Categoria não encontrad");
    await expect(
      d.moves.mergeCategories("ana", brunoMarket, source),
    ).rejects.toThrow("Categoria não encontrad");
    await expect(
      d.moves.mergeCategories("ana", archived, source),
    ).rejects.toThrow("Restaure a categoria para mesclar.");

    expect(await entriesOf(source)).toHaveLength(1);
    expect((await row(source)).archivedAt).toBeNull();
    expect(await entriesOf(brunoMarket)).toEqual(brunoBefore);
    expect((await row(brunoMarket)).archivedAt).toBeNull();
  });
});

describe("archiving with Passar para", () => {
  const ids = {} as Record<
    "parent" | "child" | "before" | "target" | "other",
    string
  >;

  beforeAll(async () => {
    ids.parent = await category("carla", "Mercado Central");
    ids.child = await category("carla", "Hortifruti", {
      parentId: ids.parent,
    });
    ids.before = await category("carla", "Açougue", { parentId: ids.parent });
    ids.target = await category("carla", "Compras");
    ids.other = await category("carla", "Outros gastos");
    await spend("carla", ids.parent, 10_000, "2026-10-02");
    await spend("carla", ids.child, 5_000, "2026-10-03");
    await spend("carla", ids.child, 3_000, "2026-10-28", { paid: false });
    await spend("carla", ids.before, 2_000, "2026-10-04");
    await spend("carla", ids.target, 1_000, "2026-10-05");
    // Archived before: stays as it is, entries included.
    await d.admin.setCategoryArchived("carla", ids.before, true);
    await d.budgets.upsertBudget(ctx.carla, {
      categoryId: ids.parent,
      month: "2026-10",
      amountCents: 30_000,
    });
    await d.budgets.upsertBudget(ctx.carla, {
      categoryId: ids.target,
      month: "2026-10",
      amountCents: 5_000,
    });
  });

  it("refuses a target among the subcategories archived along, undoing the archive", async () => {
    await expect(
      d.admin.setCategoryArchived("carla", ids.parent, true, ids.child),
    ).rejects.toThrow("Escolha uma categoria que não esteja sendo arquivada.");
    await expect(
      d.admin.setCategoryArchived("carla", ids.parent, true, ids.before),
    ).rejects.toThrow("Esta categoria está arquivada.");
    expect((await row(ids.parent)).archivedAt).toBeNull();
    expect((await row(ids.child)).archivedAt).toBeNull();
    expect(await entriesOf(ids.parent)).toHaveLength(1);
  });

  it("never passes them to someone else's category", async () => {
    const brunoMarket = await seed("bruno", "Mercado");
    await expect(
      d.admin.setCategoryArchived("carla", ids.parent, true, brunoMarket),
    ).rejects.toThrow("Categoria não encontrad");
    expect((await row(ids.parent)).archivedAt).toBeNull();
  });

  it("archives the main category and its active subcategories and passes their entries to one target", async () => {
    const result = await d.admin.setCategoryArchived(
      "carla",
      ids.parent,
      true,
      ids.target,
    );
    expect(result).toMatchObject({
      children: 1,
      restoredParent: null,
      moved: { entries: 3 },
    });
    expect(result.moved?.to).toMatch(/^Compras \d+$/);
    expect((await row(ids.parent)).archivedAt).not.toBeNull();
    expect((await row(ids.child)).archivedAt).not.toBeNull();
    expect(await entriesOf(ids.parent)).toEqual([]);
    expect(await entriesOf(ids.child)).toEqual([]);
    expect(await entriesOf(ids.target)).toHaveLength(4);
    // The subcategory archived before keeps its entry.
    expect(await entriesOf(ids.before)).toHaveLength(1);

    const range = d.context.resolvePeriod(ctx.carla, "2026-10");
    const { items } = await d.budgets.getBudgets(ctx.carla, range);
    expect(items).toEqual([
      expect.objectContaining({
        categoryId: ids.target,
        budgetCents: 35_000,
        spentCents: 16_000,
        scheduledCents: 3_000,
      }),
    ]);
    const breakdown = await d.reports.categoryBreakdown(
      ctx.carla,
      range.start,
      range.end,
    );
    expect(
      breakdown.items.find((item) => item.categoryId === ids.target)?.cents,
    ).toBe(16_000);
    // Only Açougue's entry still adds up into the archived main category.
    expect(
      breakdown.items.find((item) => item.categoryId === ids.parent)?.cents,
    ).toBe(2_000);
  });

  it("an archived category moves nothing more", async () => {
    const result = await d.admin.setCategoryArchived(
      "carla",
      ids.parent,
      true,
      ids.other,
    );
    expect(result.moved).toBeNull();
    expect(await entriesOf(ids.other)).toEqual([]);
  });

  it("restoring brings the categories back empty", async () => {
    expect(
      await d.admin.setCategoryArchived("carla", ids.parent, false),
    ).toMatchObject({ children: 1, moved: null });
    const listed = await d.admin.listCategoriesWithUsage(ctx.carla);
    const usage = (id: string) => listed.find((item) => item.id === id);
    expect(usage(ids.parent)).toMatchObject({ archived: false, entries: 0 });
    expect(usage(ids.child)).toMatchObject({ archived: false, entries: 0 });
    expect(usage(ids.target)?.entries).toBe(4);
  });

  it("names a subcategory target with its main category", async () => {
    const source = await category("carla", "Padaria Nova");
    const parent = await seed("carla", "Mercado");
    const fair = await category("carla", "Feira", { parentId: parent });
    await spend("carla", source, 800, "2026-10-06");
    const result = await d.admin.setCategoryArchived(
      "carla",
      source,
      true,
      fair,
    );
    expect(result.moved).toEqual({
      entries: 1,
      to: expect.stringMatching(/^Mercado › Feira \d+$/),
    });
  });
});

describe("reorderCategories", () => {
  async function active(kind: "income" | "expense" = "income") {
    return (await d.categories.listCategories("dani", kind)).map(
      (item) => item.id,
    );
  }

  it("saves the order among siblings", async () => {
    const before = await active();
    const reversed = [...before].reverse();
    await d.admin.reorderCategories("dani", "income", reversed);
    expect(await active()).toEqual(reversed);
  });

  it("keeps subcategories inside their main category", async () => {
    const parent = await category("dani", "Freelas", { kind: "income" });
    const first = await category("dani", "Design", {
      parentId: parent,
      kind: "income",
    });
    const second = await category("dani", "Fotos", {
      parentId: parent,
      kind: "income",
    });
    const list = await d.admin.listCategoriesForAdmin("dani");
    const { categoryTree } = await import("@/lib/categories/hierarchy");
    const { moveCategory } = await import("@/lib/categories/order");
    const tree = categoryTree(
      list.filter((item) => item.kind === "income" && !item.archived),
    );
    const moved = moveCategory(
      moveCategory(tree, second, "up"),
      parent,
      "up",
    ).map((item) => item.id);
    await d.admin.reorderCategories("dani", "income", moved);
    expect((await row(second)).sortOrder).toBe(0);
    expect((await row(first)).sortOrder).toBe(1);
    const after = categoryTree(
      (await d.admin.listCategoriesForAdmin("dani")).filter(
        (item) => item.kind === "income" && !item.archived,
      ),
    ).map((item) => item.id);
    expect(after).toEqual(moved);
  });

  it("refuses a list that changed, repeats an id or brings someone else's", async () => {
    const before = await active();
    const stale =
      "As categorias mudaram enquanto você ordenava. Atualize a página e tente de novo.";
    await expect(
      d.admin.reorderCategories("dani", "income", before.slice(1)),
    ).rejects.toThrow(stale);
    const [first = ""] = before;
    await expect(
      d.admin.reorderCategories("dani", "income", [
        ...before.slice(1),
        first,
        first,
      ]),
    ).rejects.toThrow(stale);
    const brunoSalary = await seed("bruno", "Salário");
    await expect(
      d.admin.reorderCategories("dani", "income", [
        ...before.slice(1),
        brunoSalary,
      ]),
    ).rejects.toThrow(stale);
    // Expense ids for the income list are just as stale.
    await expect(
      d.admin.reorderCategories("dani", "income", await active("expense")),
    ).rejects.toThrow(stale);
    expect(await active()).toEqual(before);
  });

  it("archived categories keep their order; a new parent sends one to the end", async () => {
    const before = await active("expense");
    const [archived = "", ...rest] = before;
    const kept = (await row(archived)).sortOrder;
    await d.admin.setCategoryArchived("dani", archived, true);
    await d.admin.reorderCategories("dani", "expense", [...rest].reverse());
    expect((await row(archived)).sortOrder).toBe(kept);

    const parent = rest[0] ?? "";
    const moving = rest[1] ?? "";
    await d.admin.updateCategory(ctx.dani, moving, { parentId: parent });
    expect(await row(moving)).toMatchObject({
      parentId: parent,
      sortOrder: 999,
    });
    await d.admin.updateCategory(ctx.dani, moving, { parentId: null });
    expect(await row(moving)).toMatchObject({ parentId: null, sortOrder: 999 });
  });
});

describe("listCategoriesWithUsage", () => {
  it("counts entries not deleted and flags a budget this month or ahead", async () => {
    const counted = await category("bruno", "Contas");
    const past = await category("bruno", "Antigas");
    const ahead = await category("bruno", "Futuras");
    await spend("bruno", counted, 1_000, "2026-10-02");
    await spend("bruno", counted, 1_000, "2026-11-02", { paid: false });
    const [gone] = await spend("bruno", counted, 1_000, "2026-10-03");
    if (!gone) throw new Error("lançamento");
    await d.transactions.deleteTransaction(ctx.bruno, gone);
    await budget("bruno", past, "2026-09", 1_000);
    await budget("bruno", ahead, "2026-11", 1_000);
    await budget("bruno", counted, "2026-10", 1_000);

    const listed = await d.admin.listCategoriesWithUsage(ctx.bruno);
    const usage = (id: string) => listed.find((item) => item.id === id);
    expect(usage(counted)).toMatchObject({ entries: 2, upcomingBudget: true });
    expect(usage(past)).toMatchObject({ entries: 0, upcomingBudget: false });
    expect(usage(ahead)).toMatchObject({ entries: 0, upcomingBudget: true });
    // Only Bruno's own categories, in the list's order.
    expect(
      (await d.admin.listCategoriesForAdmin("bruno")).map((item) => item.id),
    ).toEqual(listed.map((item) => item.id));
  });
});

describe("categoryDetail", () => {
  const ids = {} as Record<
    "market" | "fair" | "bakery" | "fuel" | "salary",
    string
  >;
  let october: import("./context").PeriodRange;

  beforeAll(async () => {
    // Bruno's own setup, in a parent without any other entries.
    ids.market = await category("bruno", "Empório");
    ids.fair = await category("bruno", "Feira", { parentId: ids.market });
    ids.bakery = await category("bruno", "Padaria", { parentId: ids.market });
    ids.fuel = await category("bruno", "Combustível");
    ids.salary = await seed("bruno", "Salário");
    await spend("bruno", ids.market, 10_000, "2026-10-02", {
      description: "Atacadão",
    });
    await spend("bruno", ids.fair, 2_000, "2026-10-06", {
      description: "Hortifruti",
    });
    await spend("bruno", ids.fair, 3_000, "2026-10-07", {
      description: "Hortifruti",
    });
    // Scheduled and deleted ones stay out.
    await spend("bruno", ids.fair, 3_000, "2026-10-20", { paid: false });
    const [gone] = await spend("bruno", ids.fair, 7_000, "2026-10-08");
    if (!gone) throw new Error("lançamento");
    await d.transactions.deleteTransaction(ctx.bruno, gone);
    await spend("bruno", ids.bakery, 2_000, "2026-10-04", {
      description: "Pão",
    });
    await d.admin.setCategoryArchived("bruno", ids.bakery, true);
    await spend("bruno", ids.market, 1_000, "2026-09-15", {
      description: "Atacadão",
    });
    await spend("bruno", ids.fuel, 3_000, "2026-10-05");
    await d.transactions.createTransaction(ctx.bruno, {
      kind: "income",
      amountCents: 40_000,
      accountId: wallet.bruno,
      categoryId: ids.salary,
      description: "Salário",
      occurredOn: "2026-10-05",
    });
    october = d.context.resolvePeriod(ctx.bruno, "2026-10");
  });

  it("splits a main category by subcategory, archived ones and Sem subcategoria included", async () => {
    const detail = await d.report.categoryDetail(
      ctx.bruno,
      ids.market,
      october,
      1,
    );
    if (!detail) throw new Error("detalhe");
    expect(detail.totalCents).toBe(17_000);
    const { totalCents } = await d.reports.categoryBreakdown(
      ctx.bruno,
      october.start,
      october.end,
    );
    expect(detail.share).toBeCloseTo(17_000 / totalCents);
    expect(
      detail.bySubcategory.map(({ categoryId, cents, archived }) => ({
        categoryId,
        cents,
        archived,
      })),
    ).toEqual([
      { categoryId: null, cents: 10_000, archived: false },
      { categoryId: ids.fair, cents: 5_000, archived: false },
      { categoryId: ids.bakery, cents: 2_000, archived: true },
    ]);
    expect(detail.bySubcategory[0]?.name).toBe("Sem subcategoria");
    expect(detail.bySubcategory[0]?.share).toBeCloseTo(10_000 / 17_000);
    expect(detail.months).toEqual([
      {
        month: "2026-10",
        start: "2026-10-01",
        end: "2026-10-31",
        cents: 17_000,
        partial: true,
      },
    ]);
    expect(detail.topDescriptions).toEqual([
      { description: "Atacadão", count: 1, cents: 10_000 },
      { description: "Hortifruti", count: 2, cents: 5_000 },
      { description: "Pão", count: 1, cents: 2_000 },
    ]);
  });

  it("covers the window month by month", async () => {
    const detail = await d.report.categoryDetail(
      ctx.bruno,
      ids.market,
      october,
      3,
    );
    expect(detail?.start).toBe("2026-08-01");
    expect(detail?.totalCents).toBe(18_000);
    expect(detail?.months.map((item) => [item.month, item.cents])).toEqual([
      ["2026-08", 0],
      ["2026-09", 1_000],
      ["2026-10", 17_000],
    ]);
  });

  it("a subcategory, an income category and one without split", async () => {
    const fair = await d.report.categoryDetail(ctx.bruno, ids.fair, october, 1);
    expect(fair?.category).toMatchObject({
      label: expect.stringMatching(/^Empório \d+ › Feira \d+$/),
      archived: false,
    });
    expect(fair?.totalCents).toBe(5_000);
    expect(fair?.bySubcategory).toEqual([]);

    const fuel = await d.report.categoryDetail(ctx.bruno, ids.fuel, october, 1);
    expect(fuel?.bySubcategory).toEqual([]);
    expect(fuel?.totalCents).toBe(3_000);

    const salary = await d.report.categoryDetail(
      ctx.bruno,
      ids.salary,
      october,
      1,
    );
    expect(salary?.totalCents).toBe(40_000);
    expect(salary?.share).toBe(1);
  });

  it("follows the financial month of the user", async () => {
    const fifth = { ...ctx.bruno, monthStartDay: 5 };
    const range = d.context.resolvePeriod(fifth, "2026-10");
    expect(range).toMatchObject({ start: "2026-10-05", end: "2026-11-04" });
    const detail = await d.report.categoryDetail(fifth, ids.market, range, 2);
    // 02/out and 04/out belong to September's period.
    expect(detail?.months.map((item) => [item.month, item.cents])).toEqual([
      ["2026-09", 13_000],
      ["2026-10", 5_000],
    ]);
  });

  it("is null for someone else's category or an unknown id", async () => {
    const anaMarket = await seed("ana", "Mercado");
    expect(
      await d.report.categoryDetail(ctx.bruno, anaMarket, october, 1),
    ).toBeNull();
    expect(
      await d.report.categoryDetail(
        ctx.bruno,
        "00000000-0000-7000-8000-000000000000",
        october,
        1,
      ),
    ).toBeNull();
  });
});
