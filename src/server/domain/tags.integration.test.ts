// Tags (task 18; doc 01 §6, doc 02 §6.5, §6.6, §6.14): names, limits,
// archive and restore, ownership, links to entries, series and recurrences,
// the Extrato filter and the CSV rows, against a real (in-memory) Postgres.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Domain = {
  accounts: typeof import("./accounts");
  categories: typeof import("./categories");
  context: typeof import("./context");
  imports: typeof import("./imports");
  recurrences: typeof import("./recurrences");
  tags: typeof import("./tags");
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
const food = {} as Record<Who, string>;
const salary = {} as Record<Who, string>;

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
    categories: await import("./categories"),
    context: await import("./context"),
    imports: await import("./imports"),
    recurrences: await import("./recurrences"),
    tags: await import("./tags"),
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
    const found = (await d.categories.listCategories(who)).find(
      (category) => category.name === "Mercado",
    );
    const pay = (await d.categories.listCategories(who)).find(
      (category) => category.name === "Salário",
    );
    if (!found || !pay) throw new Error("categoria");
    food[who] = found.id;
    salary[who] = pay.id;
  }
}, 120_000);

let counter = 0;
/** A new tag with a name no other test uses. */
async function tag(who: Who, name = "etq") {
  counter += 1;
  const made = await d.tags.ensureTag(who, `${name}${counter}`);
  return made.id;
}

function entry(
  who: Who,
  extra: Partial<import("./transactions").TransactionInput> = {},
) {
  return d.transactions.createTransaction(ctx[who], {
    kind: "expense",
    amountCents: 1_000,
    accountId: wallet[who],
    categoryId: food[who],
    description: "Compra",
    occurredOn: "2026-10-10",
    ...extra,
  });
}

async function tagIdsOf(transactionId: string) {
  const { eq } = orm;
  const rows = await db
    .select({ tagId: s.transactionTags.tagId })
    .from(s.transactionTags)
    .where(eq(s.transactionTags.transactionId, transactionId));
  return rows.map((row) => row.tagId).sort();
}

async function ruleTagIds(recurrenceId: string) {
  const { eq } = orm;
  const rows = await db
    .select({ tagId: s.recurrenceTags.tagId })
    .from(s.recurrenceTags)
    .where(eq(s.recurrenceTags.recurrenceId, recurrenceId));
  return rows.map((row) => row.tagId).sort();
}

async function seriesOf(who: Who, firstId: string) {
  const { eq, and, isNull, asc } = orm;
  const [first] = await db
    .select({
      planId: s.transactions.installmentPlanId,
      recurrenceId: s.transactions.recurrenceId,
    })
    .from(s.transactions)
    .where(eq(s.transactions.id, firstId));
  const link = first?.planId
    ? eq(s.transactions.installmentPlanId, first.planId)
    : first?.recurrenceId
      ? eq(s.transactions.recurrenceId, first.recurrenceId)
      : undefined;
  return db
    .select({
      id: s.transactions.id,
      status: s.transactions.status,
      occurredOn: s.transactions.occurredOn,
      recurrenceId: s.transactions.recurrenceId,
      amountCents: s.transactions.amountCents,
    })
    .from(s.transactions)
    .where(
      and(
        eq(s.transactions.userId, who),
        isNull(s.transactions.deletedAt),
        link,
      ),
    )
    .orderBy(asc(s.transactions.occurredOn));
}

describe("names", () => {
  it("creates a tag with a normalized name and lists it in order", async () => {
    const made = await d.tags.ensureTag("carla", "  #Viagem   Chile ");
    expect(made).toMatchObject({
      name: "Viagem Chile",
      created: true,
      restored: false,
    });
    await d.tags.ensureTag("carla", "ágora");
    const names = (await d.tags.listTags("carla")).map((item) => item.name);
    expect(names).toEqual(["ágora", "Viagem Chile"]);
  });

  it("treats case, accent and hash as the same name", async () => {
    const first = await d.tags.ensureTag("ana", "Férias");
    for (const variant of ["férias", "FERIAS", "#ferias", " Férias "]) {
      const again = await d.tags.ensureTag("ana", variant);
      expect(again).toMatchObject({
        id: first.id,
        created: false,
        restored: false,
      });
      await expect(
        d.tags.ensureTag("ana", variant, { failIfActive: true }),
      ).rejects.toThrow("Já existe uma etiqueta com esse nome.");
    }
  });

  it("refuses an empty or a too long name", async () => {
    await expect(d.tags.ensureTag("ana", " # ")).rejects.toThrow(
      "Informe um nome.",
    );
    await expect(d.tags.ensureTag("ana", "x".repeat(31))).rejects.toThrow(
      "Use até 30 caracteres.",
    );
    await expect(
      d.tags.ensureTag("ana", "x".repeat(30)),
    ).resolves.toMatchObject({ created: true });
  });

  it("findTagByName ignores case, accents and the hash, and sees archived ones", async () => {
    const id = await tag("ana", "Ônibus");
    const name = (await d.tags.listTags("ana")).find(
      (item) => item.id === id,
    )?.name;
    const found = await d.tags.findTagByName(
      db,
      "ana",
      `#${name?.toUpperCase()}`,
    );
    expect(found).toEqual({ id, name, archived: false });
    await d.tags.setTagArchived("ana", id, true);
    expect(await d.tags.findTagByName(db, "ana", name ?? "")).toMatchObject({
      id,
      archived: true,
    });
    expect(await d.tags.findTagByName(db, "bruno", name ?? "")).toBeNull();
    expect(await d.tags.findTagByName(db, "ana", "nunca-existiu")).toBeNull();
  });

  it("renames, refusing another tag's name, and keeps archived ones renamable", async () => {
    const a = await tag("ana", "ren");
    const b = await tag("ana", "ren");
    const bName = (await d.tags.listTags("ana")).find((i) => i.id === b)?.name;
    await expect(d.tags.renameTag("ana", a, bName ?? "")).rejects.toThrow(
      "Já existe uma etiqueta com esse nome.",
    );
    await expect(
      d.tags.renameTag("ana", a, `  #Novo Nome ${a.slice(-4)} `),
    ).resolves.toEqual({ name: `Novo Nome ${a.slice(-4)}` });
    // The same tag with other letters is fine.
    await expect(
      d.tags.renameTag("ana", a, `novo nome ${a.slice(-4)}`),
    ).resolves.toBeDefined();
    await d.tags.setTagArchived("ana", a, true);
    await expect(
      d.tags.renameTag("ana", a, `Arquivada ${a.slice(-4)}`),
    ).resolves.toBeDefined();
  });
});

describe("archive and restore", () => {
  it("hides from the active list, keeps the links, and is idempotent", async () => {
    const id = await tag("ana", "arq");
    const { ids } = await entry("ana", { tagIds: [id] });
    const txnId = ids[0] ?? "";
    expect(await d.tags.setTagArchived("ana", id, true)).toMatchObject({
      name: expect.any(String),
    });
    await d.tags.setTagArchived("ana", id, true);
    expect((await d.tags.listTags("ana")).map((i) => i.id)).not.toContain(id);
    expect(
      (await d.tags.listTags("ana", { includeArchived: true })).find(
        (i) => i.id === id,
      )?.archived,
    ).toBe(true);
    expect(await tagIdsOf(txnId)).toEqual([id]);
    await d.tags.setTagArchived("ana", id, false);
    expect((await d.tags.listTags("ana")).map((i) => i.id)).toContain(id);
  });

  it("creating the name of an archived tag restores it instead of failing", async () => {
    const id = await tag("ana", "volta");
    const name =
      (await d.tags.listTags("ana")).find((i) => i.id === id)?.name ?? "";
    await d.tags.setTagArchived("ana", id, true);
    for (const options of [{}, { failIfActive: true }]) {
      await d.tags.setTagArchived("ana", id, true);
      const again = await d.tags.ensureTag("ana", name.toUpperCase(), options);
      expect(again).toMatchObject({ id, created: false, restored: true });
      expect(
        (await d.tags.listTags("ana")).find((i) => i.id === id)?.archived,
      ).toBe(false);
    }
  });

  it("counts entries per tag, not the deleted ones", async () => {
    const id = await tag("ana", "uso");
    await entry("ana", { tagIds: [id] });
    const { ids } = await entry("ana", { tagIds: [id] });
    await d.transactions.deleteTransaction(ctx.ana, ids[0] ?? "");
    const usage = await d.tags.listTagsWithUsage("ana");
    expect(usage.find((item) => item.id === id)?.entries).toBe(1);
    expect(await d.tags.countActiveTags("ana")).toBeGreaterThan(0);
  });
});

describe("limits", () => {
  it("stops at 100 active tags, and archiving frees one", async () => {
    const who: Who = "dani";
    for (let i = 0; i < 100; i++) await d.tags.ensureTag(who, `limite ${i}`);
    expect(await d.tags.countActiveTags(who)).toBe(100);
    await expect(d.tags.ensureTag(who, "a centésima primeira")).rejects.toThrow(
      "Você chegou a 100 etiquetas. Arquive alguma para criar outra.",
    );
    // An existing name is still reused at the limit.
    await expect(d.tags.ensureTag(who, "LIMITE 3")).resolves.toMatchObject({
      created: false,
    });
    const first = (await d.tags.listTags(who))[0];
    await d.tags.setTagArchived(who, first?.id ?? "", true);
    await expect(
      d.tags.ensureTag(who, "a centésima primeira"),
    ).resolves.toMatchObject({ created: true });
  });

  it("refuses more than ten tags on an entry", async () => {
    const list: string[] = [];
    for (let i = 0; i < 11; i++) list.push(await tag("carla", "dez"));
    await expect(entry("carla", { tagIds: list })).rejects.toThrow(
      "Escolha até 10 etiquetas.",
    );
    await expect(
      entry("carla", { tagIds: list.slice(0, 10) }),
    ).resolves.toBeDefined();
    // The same id twice counts once.
    const one = list[0] ?? "";
    const { ids } = await entry("carla", { tagIds: [one, one] });
    expect(await tagIdsOf(ids[0] ?? "")).toEqual([one]);
  });
});

describe("ownership", () => {
  it("never lets another account rename, archive or use a tag", async () => {
    const id = await tag("ana", "privada");
    await expect(d.tags.renameTag("bruno", id, "minha")).rejects.toThrow(
      "Etiqueta não encontrado(a).",
    );
    await expect(d.tags.setTagArchived("bruno", id, true)).rejects.toThrow(
      "Etiqueta não encontrado(a).",
    );
    await expect(entry("bruno", { tagIds: [id] })).rejects.toThrow(
      "Etiqueta não encontrado(a).",
    );
    const own = await entry("bruno");
    await expect(
      d.transactions.updateTransaction(ctx.bruno, own.ids[0] ?? "", {
        tagIds: [id],
      }),
    ).rejects.toThrow("Etiqueta não encontrado(a).");
    const other = await d.tags.listTags("ana", { includeArchived: true });
    expect(other.find((i) => i.id === id)?.archived).toBe(false);
    // The same name is a different tag in each account.
    const name = other.find((i) => i.id === id)?.name ?? "";
    const theirs = await d.tags.ensureTag("carla", name);
    expect(theirs.id).not.toBe(id);
    expect(theirs.created).toBe(true);
  });

  it("does not read another account's tags on its entries", async () => {
    const id = await tag("ana", "leitura");
    const { ids } = await entry("ana", { tagIds: [id] });
    const map = await d.tags.tagsForTransactions("bruno", ids);
    expect(map.size).toBe(0);
    const mine = await d.tags.tagsForTransactions("ana", ids);
    expect(mine.get(ids[0] ?? "")?.map((i) => i.id)).toEqual([id]);
    expect((await d.tags.tagsForTransactions("ana", [])).size).toBe(0);
  });
});

describe("tags on entries", () => {
  it("links an expense and an income, listed in name order", async () => {
    const a = await tag("ana", "b-tag");
    const b = await tag("ana", "a-tag");
    const { ids } = await entry("ana", { tagIds: [a, b] });
    const income = await entry("ana", {
      kind: "income",
      categoryId: salary.ana,
      tagIds: [a],
      description: "Extra",
    });
    expect(await tagIdsOf(ids[0] ?? "")).toEqual([a, b].sort());
    expect(await tagIdsOf(income.ids[0] ?? "")).toEqual([a]);
    const listed = await d.transactions.listTransactions(ctx.ana, {
      start: "2026-10-01",
      end: "2026-10-31",
    });
    const item = listed.items.find((row) => row.id === ids[0]);
    expect(item?.tags.map((t) => t.id)).toEqual([b, a]);
    expect(
      (await d.transactions.getTransaction(ctx.ana, ids[0] ?? ""))?.tags,
    ).toHaveLength(2);
  });

  it("gives every installment the tags", async () => {
    const id = await tag("ana", "parc");
    const { ids } = await entry("ana", {
      installments: 3,
      amountCents: 3_000,
      tagIds: [id],
    });
    expect(ids).toHaveLength(3);
    for (const txn of ids) expect(await tagIdsOf(txn)).toEqual([id]);
  });

  it("stores the tags on the rule and on the occurrences", async () => {
    const id = await tag("ana", "rec");
    const { ids } = await entry("ana", {
      occurredOn: "2026-10-14",
      recurrence: { freq: "monthly" },
      tagIds: [id],
    });
    const series = await seriesOf("ana", ids[0] ?? "");
    expect(series.length).toBeGreaterThan(1);
    for (const row of series) expect(await tagIdsOf(row.id)).toEqual([id]);
    expect(await ruleTagIds(series[0]?.recurrenceId ?? "")).toEqual([id]);
  });

  it("refuses an archived tag to link, keeps it when editing", async () => {
    const id = await tag("ana", "velha");
    const other = await tag("ana", "nova");
    const { ids } = await entry("ana", { tagIds: [id] });
    const txnId = ids[0] ?? "";
    await d.tags.setTagArchived("ana", id, true);
    await expect(entry("ana", { tagIds: [id] })).rejects.toThrow(
      "Esta etiqueta está arquivada.",
    );
    // Editing keeps what the entry already had...
    await d.transactions.updateTransaction(ctx.ana, txnId, {
      tagIds: [id, other],
    });
    expect(await tagIdsOf(txnId)).toEqual([id, other].sort());
    // ...but another entry cannot take it.
    const plain = await entry("ana");
    await expect(
      d.transactions.updateTransaction(ctx.ana, plain.ids[0] ?? "", {
        tagIds: [id],
      }),
    ).rejects.toThrow("Esta etiqueta está arquivada.");
    // An empty set clears.
    await d.transactions.updateTransaction(ctx.ana, txnId, { tagIds: [] });
    expect(await tagIdsOf(txnId)).toEqual([]);
  });

  it("leaves the tags alone when the patch does not carry them", async () => {
    const id = await tag("ana", "fica");
    const { ids } = await entry("ana", { tagIds: [id] });
    await d.transactions.updateTransaction(ctx.ana, ids[0] ?? "", {
      description: "Outra",
    });
    expect(await tagIdsOf(ids[0] ?? "")).toEqual([id]);
  });

  it("refuses tags on a transfer or an adjustment", async () => {
    const id = await tag("ana", "transf");
    const second = await d.accounts.createAccount("ana", {
      name: "Reserva",
      type: "investment",
      initialBalanceCents: 0,
    });
    const { transferId } = await d.transactions.createTransfer(ctx.ana, {
      fromAccountId: wallet.ana,
      toAccountId: second,
      amountCents: 500,
      occurredOn: "2026-10-10",
    });
    const { eq } = orm;
    const [leg] = await db
      .select({ id: s.transactions.id })
      .from(s.transactions)
      .where(eq(s.transactions.transferId, transferId));
    const ids = [leg?.id ?? ""];
    await expect(
      d.transactions.updateTransaction(ctx.ana, ids[0] ?? "", {
        tagIds: [id],
      }),
    ).rejects.toThrow("Transferências e ajustes não levam etiquetas.");
    // An empty set is ignored.
    await expect(
      d.transactions.updateTransaction(ctx.ana, ids[0] ?? "", { tagIds: [] }),
    ).resolves.toBeUndefined();
  });
});

describe("editing a series", () => {
  it("installments: only the tags, 'future' and 'all' (the early return)", async () => {
    const x = await tag("ana", "p1");
    const y = await tag("ana", "p2");
    const { ids } = await entry("ana", {
      installments: 4,
      amountCents: 4_000,
      occurredOn: "2026-10-14",
      tagIds: [x],
    });
    const [i1, i2, i3, i4] = ids as [string, string, string, string];
    await d.transactions.updateTransaction(
      ctx.ana,
      i3,
      { tagIds: [x, y] },
      "future",
    );
    expect(await tagIdsOf(i1)).toEqual([x]);
    expect(await tagIdsOf(i2)).toEqual([x]);
    expect(await tagIdsOf(i3)).toEqual([x, y].sort());
    expect(await tagIdsOf(i4)).toEqual([x, y].sort());

    await d.transactions.updateTransaction(ctx.ana, i2, { tagIds: [y] }, "all");
    for (const id of [i1, i2, i3, i4]) expect(await tagIdsOf(id)).toEqual([y]);

    await d.transactions.updateTransaction(
      ctx.ana,
      i2,
      { tagIds: [x] },
      "this",
    );
    expect(await tagIdsOf(i1)).toEqual([y]);
    expect(await tagIdsOf(i2)).toEqual([x]);
  });

  it("recurrence 'future' without a split: this and the pending ones, and the rule", async () => {
    const x = await tag("ana", "r1");
    const y = await tag("ana", "r2");
    const { ids } = await entry("ana", {
      occurredOn: "2026-10-14",
      recurrence: { freq: "monthly" },
      tagIds: [x],
    });
    const series = await seriesOf("ana", ids[0] ?? "");
    const [first, second, ...rest] = series;
    if (!first || !second) throw new Error("série");
    expect(first.status).toBe("paid");
    const rule = first.recurrenceId ?? "";

    await d.transactions.updateTransaction(
      ctx.ana,
      second.id,
      { tagIds: [x, y] },
      "future",
    );
    expect(await tagIdsOf(first.id)).toEqual([x]);
    expect(await tagIdsOf(second.id)).toEqual([x, y].sort());
    for (const row of rest)
      expect(await tagIdsOf(row.id)).toEqual([x, y].sort());
    // Only tags changed: the rule did not split, it carries the new set.
    expect(
      (await seriesOf("ana", first.id)).every((r) => r.recurrenceId === rule),
    ).toBe(true);
    expect(await ruleTagIds(rule)).toEqual([x, y].sort());
  });

  it("recurrence 'all': this and the pending ones; paid ones keep theirs", async () => {
    const x = await tag("ana", "a1");
    const y = await tag("ana", "a2");
    const { ids } = await entry("ana", {
      occurredOn: "2026-10-14",
      recurrence: { freq: "monthly" },
      tagIds: [x],
    });
    const [first, second, ...rest] = await seriesOf("ana", ids[0] ?? "");
    if (!first || !second) throw new Error("série");
    await d.transactions.updateTransaction(
      ctx.ana,
      second.id,
      { tagIds: [y] },
      "all",
    );
    expect(await tagIdsOf(first.id)).toEqual([x]);
    expect(await tagIdsOf(second.id)).toEqual([y]);
    for (const row of rest) expect(await tagIdsOf(row.id)).toEqual([y]);
    expect(await ruleTagIds(first.recurrenceId ?? "")).toEqual([y]);
  });

  it("recurrence 'future' with a split by amount: the new rule gets the tags, the old keeps its own", async () => {
    const x = await tag("ana", "s1");
    const y = await tag("ana", "s2");
    const { ids } = await entry("ana", {
      occurredOn: "2026-10-14",
      recurrence: { freq: "monthly" },
      tagIds: [x],
    });
    await d.recurrences.materializeRecurrences({ now: NOW + 75 * DAY });
    const [first, second, ...rest] = await seriesOf("ana", ids[0] ?? "");
    if (!first || !second) throw new Error("série");
    const oldRule = first.recurrenceId ?? "";
    // The amount changes: the series splits. Without tagIds the new rule
    // copies the old rule's tags.
    await d.transactions.updateTransaction(
      ctx.ana,
      second.id,
      { amountCents: 2_500 },
      "future",
    );
    const ruleOf = async (id: string) => {
      const { eq } = orm;
      const [found] = await db
        .select({ rule: s.transactions.recurrenceId })
        .from(s.transactions)
        .where(eq(s.transactions.id, id));
      return found?.rule ?? "";
    };
    const newRule = await ruleOf(second.id);
    expect(newRule).toBeTruthy();
    expect(newRule).not.toBe(oldRule);
    expect(await ruleTagIds(newRule ?? "")).toEqual([x]);
    expect(await ruleTagIds(oldRule)).toEqual([x]);

    // Changing tags and amount together: the new rule takes the new set.
    const third = rest[0];
    if (!third) throw new Error("série");
    await d.transactions.updateTransaction(
      ctx.ana,
      third.id,
      { amountCents: 3_100, tagIds: [y] },
      "future",
    );
    const thirdRule = await ruleOf(third.id);
    expect(thirdRule).not.toBe(newRule);
    expect(await ruleTagIds(thirdRule ?? "")).toEqual([y]);
    expect(await ruleTagIds(newRule ?? "")).toEqual([x]);
    expect(await tagIdsOf(third.id)).toEqual([y]);
    expect(await tagIdsOf(second.id)).toEqual([x]);
  });

  it("never touches another account's series", async () => {
    const mine = await tag("ana", "iso");
    const theirs = await tag("bruno", "iso");
    const { ids } = await entry("bruno", { tagIds: [theirs] });
    await expect(
      d.transactions.updateTransaction(ctx.ana, ids[0] ?? "", {
        tagIds: [mine],
      }),
    ).rejects.toThrow();
    expect(await tagIdsOf(ids[0] ?? "")).toEqual([theirs]);
  });
});

describe("the recurrence job", () => {
  it("copies the rule's tags to the occurrences it creates", async () => {
    const id = await tag("carla", "job");
    const { ids } = await entry("carla", {
      occurredOn: "2026-10-14",
      recurrence: { freq: "monthly" },
      tagIds: [id],
    });
    const before = await seriesOf("carla", ids[0] ?? "");
    await d.recurrences.materializeRecurrences({ now: NOW + 120 * DAY });
    const after = await seriesOf("carla", ids[0] ?? "");
    expect(after.length).toBeGreaterThan(before.length);
    const known = new Set(before.map((row) => row.id));
    const created = after.filter((row) => !known.has(row.id));
    for (const row of created) expect(await tagIdsOf(row.id)).toEqual([id]);
  });
});

describe("the Extrato filter", () => {
  it("lists only the entries with the tag, never another account's", async () => {
    const id = await tag("ana", "filtro");
    const other = await tag("ana", "outro");
    const a = await entry("ana", { tagIds: [id], description: "Com filtro" });
    await entry("ana", { tagIds: [other], description: "Com outro" });
    await entry("ana", { description: "Sem nada" });
    const list = (who: Who, tagId: string) =>
      d.transactions.listTransactions(ctx[who], {
        start: "2026-10-01",
        end: "2026-10-31",
        tagId,
      });
    expect((await list("ana", id)).items.map((row) => row.id)).toEqual(a.ids);
    // A foreign id shows nothing, not the owner's entries.
    expect((await list("bruno", id)).items).toEqual([]);
  });
});

describe("the CSV rows", () => {
  it("brings each entry's tag names in order", async () => {
    const x = await d.tags.ensureTag("carla", "zebra");
    const y = await d.tags.ensureTag("carla", "Abelha");
    await entry("carla", {
      tagIds: [x.id, y.id],
      description: "Etiquetada",
      occurredOn: "2026-09-20",
    });
    await entry("carla", { description: "Solta", occurredOn: "2026-09-20" });
    const rows = await d.imports.listExportRows(ctx.carla, {
      start: "2026-09-20",
      end: "2026-09-20",
    });
    expect(rows.map((row) => [row.description, row.tags]).sort()).toEqual([
      ["Etiquetada", ["Abelha", "zebra"]],
      ["Solta", []],
    ]);
    expect(
      await d.imports.listExportRows(ctx.bruno, {
        start: "2026-09-20",
        end: "2026-09-20",
      }),
    ).toEqual([]);
  });
});
