// The report by tag (task 18; doc 02 §6.12, doc 03 §12): paid entries only,
// by purchase date, no transfers, no deleted ones, an entry in two tags counts
// in both, and nothing of anyone else's.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  categories: typeof import("./categories");
  context: typeof import("./context");
  report: typeof import("./tag-report");
  tags: typeof import("./tags");
  transactions: typeof import("./transactions");
};
type Who = "ana" | "bruno";

let d: Domain;
let db: typeof import("../db/client").db;
let s: typeof import("../db/schema");
const ctx = {} as Record<Who, import("./context").UserContext>;
const wallet = {} as Record<Who, string>;
const cats = {} as Record<"market" | "feira" | "salary", string>;
const tag = {} as Record<"viagem" | "casa" | "vazia", string>;
let brunoTag = "";

// 14/out/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  db = (await import("../db/client")).db;
  await migrate(db as never, { migrationsFolder: "drizzle" });
  s = await import("../db/schema");
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  d = {
    accounts: await import("./accounts"),
    categories: await import("./categories"),
    context: await import("./context"),
    report: await import("./tag-report"),
    tags: await import("./tags"),
    transactions: await import("./transactions"),
  };
  for (const who of ["ana", "bruno"] as const) {
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
  const list = await d.categories.listCategories("ana");
  const find = (name: string) => {
    const found = list.find((category) => category.name === name);
    if (!found) throw new Error(name);
    return found.id;
  };
  cats.market = find("Mercado");
  cats.salary = find("Salário");
  cats.feira = await d.categories.createCategory("ana", {
    kind: "expense",
    name: "Feira",
    icon: "carrot",
    color: "cat-1",
    parentId: cats.market,
  });
  tag.viagem = (await d.tags.ensureTag("ana", "viagem")).id;
  tag.casa = (await d.tags.ensureTag("ana", "casa")).id;
  tag.vazia = (await d.tags.ensureTag("ana", "vazia")).id;
  brunoTag = (await d.tags.ensureTag("bruno", "viagem")).id;
}, 120_000);

function add(
  who: Who,
  extra: Partial<import("./transactions").TransactionInput>,
) {
  return d.transactions.createTransaction(ctx[who], {
    kind: "expense",
    amountCents: 1_000,
    accountId: wallet[who],
    categoryId: cats.market,
    description: "Compra",
    occurredOn: "2026-10-05",
    ...extra,
  });
}

beforeAll(async () => {
  await add("ana", {
    amountCents: 10_000,
    description: "Hotel",
    occurredOn: "2026-10-05",
    tagIds: [tag.viagem, tag.casa],
  });
  await add("ana", {
    amountCents: 2_500,
    description: "Pastel",
    occurredOn: "2026-10-07",
    categoryId: cats.feira,
    tagIds: [tag.viagem],
  });
  await add("ana", {
    kind: "income",
    amountCents: 4_000,
    description: "Reembolso",
    categoryId: cats.salary,
    occurredOn: "2026-10-09",
    tagIds: [tag.viagem],
  });
  // Out of the window.
  await add("ana", {
    amountCents: 7_000,
    description: "Setembro",
    occurredOn: "2026-09-30",
    tagIds: [tag.viagem],
  });
  // Scheduled: not paid yet.
  await add("ana", {
    amountCents: 3_000,
    description: "Agendado",
    occurredOn: "2026-10-25",
    paid: false,
    tagIds: [tag.viagem],
  });
  // Deleted.
  const { ids } = await add("ana", {
    amountCents: 9_900,
    description: "Apagado",
    occurredOn: "2026-10-06",
    tagIds: [tag.viagem],
  });
  await d.transactions.deleteTransaction(ctx.ana, ids[0] ?? "");
  // A transfer leg that somehow carries the tag.
  const reserve = await d.accounts.createAccount("ana", {
    name: "Reserva",
    type: "investment",
    initialBalanceCents: 0,
  });
  const { transferId } = await d.transactions.createTransfer(ctx.ana, {
    fromAccountId: wallet.ana,
    toAccountId: reserve,
    amountCents: 5_000,
    occurredOn: "2026-10-08",
  });
  const { eq } = await import("drizzle-orm");
  const legs = await db
    .select({ id: s.transactions.id })
    .from(s.transactions)
    .where(eq(s.transactions.transferId, transferId));
  await db
    .insert(s.transactionTags)
    .values(legs.map((leg) => ({ transactionId: leg.id, tagId: tag.viagem })));
  // Someone else's, with their own tag.
  const brunoMarket = (await d.categories.listCategories("bruno")).find(
    (category) => category.name === "Mercado",
  );
  await add("bruno", {
    categoryId: brunoMarket?.id ?? null,
    amountCents: 55_000,
    description: "Do Bruno",
    occurredOn: "2026-10-05",
    tagIds: [brunoTag],
  });
}, 60_000);

describe("tagBreakdown", () => {
  it("sums paid expenses and income of the window, largest expense first, counting an entry in each of its tags", async () => {
    const { items } = await d.report.tagBreakdown(
      ctx.ana,
      "2026-10-01",
      "2026-10-31",
    );
    expect(items).toEqual([
      {
        tagId: tag.viagem,
        name: "viagem",
        archived: false,
        expenseCents: 12_500,
        incomeCents: 4_000,
        count: 3,
      },
      {
        tagId: tag.casa,
        name: "casa",
        archived: false,
        expenseCents: 10_000,
        incomeCents: 0,
        count: 1,
      },
    ]);
  });

  it("follows the window and leaves out tags with nothing in it", async () => {
    const sep = await d.report.tagBreakdown(
      ctx.ana,
      "2026-09-01",
      "2026-09-30",
    );
    expect(sep.items.map((item) => [item.name, item.expenseCents])).toEqual([
      ["viagem", 7_000],
    ]);
    const none = await d.report.tagBreakdown(
      ctx.ana,
      "2026-01-01",
      "2026-01-31",
    );
    expect(none.items).toEqual([]);
  });

  it("only reads the person's own tags and entries", async () => {
    const { items } = await d.report.tagBreakdown(
      ctx.bruno,
      "2026-10-01",
      "2026-10-31",
    );
    expect(items).toEqual([
      {
        tagId: brunoTag,
        name: "viagem",
        archived: false,
        expenseCents: 55_000,
        incomeCents: 0,
        count: 1,
      },
    ]);
  });

  it("keeps an archived tag in the report", async () => {
    await d.tags.setTagArchived("ana", tag.casa, true);
    const { items } = await d.report.tagBreakdown(
      ctx.ana,
      "2026-10-01",
      "2026-10-31",
    );
    expect(items.find((item) => item.tagId === tag.casa)?.archived).toBe(true);
    await d.tags.setTagArchived("ana", tag.casa, false);
  });
});

describe("tagDetail", () => {
  it("totals and lists the paid entries, newest first, with the category path", async () => {
    const detail = await d.report.tagDetail(
      ctx.ana,
      tag.viagem,
      "2026-10-01",
      "2026-10-31",
    );
    expect(detail).toMatchObject({
      tag: { id: tag.viagem, name: "viagem", archived: false },
      expenseCents: 12_500,
      incomeCents: 4_000,
      count: 3,
      hasMore: false,
    });
    expect(
      detail?.items.map((item) => [
        item.description,
        item.amountCents,
        item.kind,
        item.categoryLabel,
        item.accountName,
      ]),
    ).toEqual([
      ["Reembolso", 4_000, "income", "Salário", "Carteira"],
      ["Pastel", -2_500, "expense", "Mercado › Feira", "Carteira"],
      ["Hotel", -10_000, "expense", "Mercado", "Carteira"],
    ]);
  });

  it("says there is more when the list is cut", async () => {
    const detail = await d.report.tagDetail(
      ctx.ana,
      tag.viagem,
      "2026-10-01",
      "2026-10-31",
      2,
    );
    expect(detail?.items).toHaveLength(2);
    expect(detail?.hasMore).toBe(true);
    // The totals still cover all of them.
    expect(detail?.count).toBe(3);
  });

  it("is null for another person's tag and for an id that does not exist", async () => {
    expect(
      await d.report.tagDetail(
        ctx.bruno,
        tag.viagem,
        "2026-10-01",
        "2026-10-31",
      ),
    ).toBeNull();
    expect(
      await d.report.tagDetail(
        ctx.ana,
        "0199e3a0-0000-7000-8000-0000000000ff",
        "2026-10-01",
        "2026-10-31",
      ),
    ).toBeNull();
  });

  it("opens an archived tag and an empty one", async () => {
    await d.tags.setTagArchived("ana", tag.vazia, true);
    const detail = await d.report.tagDetail(
      ctx.ana,
      tag.vazia,
      "2026-10-01",
      "2026-10-31",
    );
    expect(detail).toMatchObject({
      tag: { archived: true },
      count: 0,
      expenseCents: 0,
      incomeCents: 0,
      items: [],
      hasMore: false,
    });
  });
});
