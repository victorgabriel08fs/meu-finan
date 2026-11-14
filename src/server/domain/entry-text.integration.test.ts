// "Lançamento por texto" (doc 02 §6.5) against a real (in-memory) Postgres:
// account and category found among the person's own data, the tags the phrase
// names, isolation between people, and the action's flag and validation.
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ refresh }));
const signedIn = vi.hoisted(() => ({ id: "ana" }));
vi.mock("@/server/dal", () => ({
  requireUser: async () => ({
    id: signedIn.id,
    name: signedIn.id,
    email: `${signedIn.id}@exemplo.com`,
    role: "user",
  }),
  getAdmin: async () => null,
  getSession: async () => null,
}));
process.env.DATABASE_URL = "pglite:memory";

type Who = "ana" | "bruno";
type Modules = {
  db: typeof import("../db/client")["db"];
  s: typeof import("../db/schema");
  accounts: typeof import("./accounts");
  categories: typeof import("./categories");
  context: typeof import("./context");
  entryText: typeof import("./entry-text");
  tags: typeof import("./tags");
  transactions: typeof import("./transactions");
  action: typeof import("../actions/entry-text");
};
let m: Modules;

const ctx = {} as Record<Who, import("./context").UserContext>;
const account = {} as Record<string, string>;
const category = {} as Record<string, string>;

// Saturday, 14 Nov 2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 10, 14, 15, 0, 0);

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("../db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const s = await import("../db/schema");
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  m = {
    db: client.db,
    s,
    accounts: await import("./accounts"),
    categories: await import("./categories"),
    context: await import("./context"),
    entryText: await import("./entry-text"),
    tags: await import("./tags"),
    transactions: await import("./transactions"),
    action: await import("../actions/entry-text"),
  };
  for (const who of ["ana", "bruno"] as const) {
    await m.db
      .insert(s.user)
      .values({ id: who, name: who, email: `${who}@exemplo.com` });
    await ensureOwnerDefaults(who);
    ctx[who] = await m.context.getUserContext(who, { now: NOW });
    const list = await m.categories.listCategories(who);
    for (const name of ["Mercado", "Restaurantes", "Transporte", "Salário"]) {
      const found = list.find((item) => item.name === name);
      if (found) category[`${who}:${name}`] = found.id;
    }
    for (const name of ["Nubank", "Cartão Nubank", "Padaria"]) {
      if (who === "bruno" && name !== "Nubank") continue;
      account[`${who}:${name}`] = await m.accounts.createAccount(who, {
        name,
        type: name === "Cartão Nubank" ? "credit_card" : "checking",
        initialBalanceCents: 0,
        ...(name === "Cartão Nubank"
          ? {
              card: {
                limitCents: 100_000,
                closingDay: 5,
                dueDay: 12,
                paymentAccountId: account[`${who}:Nubank`] ?? null,
              },
            }
          : {}),
      });
    }
  }
}, 120_000);

const read = (who: Who, text: string, kind: "expense" | "income" = "expense") =>
  m.entryText.interpretEntryText(ctx[who], { text, kind });

describe("account and date", () => {
  it("finds the person's account and the date", async () => {
    const result = await read("ana", "café 12 no nubank ontem");
    expect(result).toMatchObject({
      amountCents: 1200,
      occurredOn: "2026-11-13",
      accountId: account["ana:Nubank"],
      description: "café",
      warnings: [],
    });
  });

  it("never matches another person's account or an archived one", async () => {
    const other = await read("bruno", "pão 5 na padaria");
    expect(other.accountId).toBeNull();
    expect(other.description).toBe("pão na padaria");
    expect(other.unmatchedAccount).toBe("padaria");
    await m.accounts.archiveAccount("ana", account["ana:Padaria"] ?? "");
    const archived = await read("ana", "pão 5 na padaria");
    expect(archived.accountId).toBeNull();
    expect(archived.description).toBe("pão na padaria");
  });

  it("warns about an ambiguous account and a missing amount", async () => {
    const result = await read("ana", "café no cartão nubank e nubank");
    expect(result.warnings).toContain(
      "Não encontrei o valor: digite no teclado.",
    );
    const ambiguous = await read("ana", "café 3 no nubank");
    expect(ambiguous.accountId).toBe(account["ana:Nubank"]);
  });
});

describe("category", () => {
  async function spend(who: Who, description: string, categoryId: string) {
    await m.transactions.createTransaction(ctx[who], {
      kind: "expense",
      amountCents: 1_000,
      accountId: account[`${who}:Nubank`] ?? "",
      categoryId,
      description,
      occurredOn: "2026-11-01",
    });
  }

  it("suggests from the person's history, of the chosen kind", async () => {
    await spend("ana", "Pão francês", category["ana:Mercado"] ?? "");
    const result = await read("ana", "pão francês 8");
    expect(result.categoryId).toBe(category["ana:Mercado"]);
    const asIncome = await read("ana", "pão francês 8", "income");
    expect(asIncome.categoryId).toBeNull();
  });

  it("does not use another person's history", async () => {
    await spend("bruno", "Corrida", category["bruno:Transporte"] ?? "");
    expect((await read("ana", "corrida 20")).categoryId).toBeNull();
    expect((await read("bruno", "corrida 20")).categoryId).toBe(
      category["bruno:Transporte"],
    );
  });

  it("a rule beats the history, and a rule of an account only counts there", async () => {
    await spend("ana", "Ifood", category["ana:Mercado"] ?? "");
    await m.db.insert(m.s.categorizationRules).values([
      {
        userId: "ana",
        pattern: "ifood",
        categoryId: category["ana:Restaurantes"] ?? "",
      },
      {
        userId: "ana",
        pattern: "uber",
        categoryId: category["ana:Transporte"] ?? "",
        accountId: account["ana:Cartão Nubank"] ?? null,
      },
    ]);
    expect((await read("ana", "ifood 40")).categoryId).toBe(
      category["ana:Restaurantes"],
    );
    expect((await read("ana", "uber 20 no cartão nubank")).categoryId).toBe(
      category["ana:Transporte"],
    );
    expect((await read("ana", "uber 20 no nubank")).categoryId).toBeNull();
  });
});

describe("tags", () => {
  const find = async (who: Who, name: string) => {
    const [row] = await m.db
      .select()
      .from(m.s.tags)
      .where(and(eq(m.s.tags.userId, who), eq(m.s.tags.name, name)));
    return row;
  };

  it("creates a new tag, reuses an active one and restores an archived one", async () => {
    const fresh = await read("ana", "x 5 #viagem-chile");
    expect(fresh.tags.map((tag) => tag.name)).toEqual(["viagem chile"]);
    expect(fresh.tagsChanged).toBe(true);

    const again = await read("ana", "x 5 #Viagem-Chile");
    expect(again.tags[0]?.id).toBe(fresh.tags[0]?.id);
    expect(again.tagsChanged).toBe(false);

    await m.tags.setTagArchived("ana", fresh.tags[0]?.id ?? "", true);
    const restored = await read("ana", "x 5 #viagem-chile");
    expect(restored.tags[0]?.id).toBe(fresh.tags[0]?.id);
    expect(restored.warnings).toContain(
      "A etiqueta “viagem chile” estava arquivada e voltou.",
    );
    expect((await find("ana", "viagem chile"))?.archivedAt).toBeNull();
  });

  it("does not see another person's tag with the same name", async () => {
    const theirs = await read("bruno", "x 5 #casa");
    const mine = await read("ana", "x 5 #casa");
    expect(mine.tags[0]?.id).not.toBe(theirs.tags[0]?.id);
    expect((await find("ana", "casa"))?.id).toBe(mine.tags[0]?.id);
  });

  it("warns at 100 active tags and still reads the rest", async () => {
    await m.tags.ensureTag("bruno", "fill1");
    for (let i = 2; (await m.tags.countActiveTags("bruno")) < 100; i++) {
      await m.tags.ensureTag("bruno", `fill${i}`);
    }
    const result = await read("bruno", "mercado 30 #nova #fill1");
    expect(result.amountCents).toBe(3000);
    expect(result.tags.map((tag) => tag.name)).toEqual(["fill1"]);
    expect(result.warnings).toContain(
      "Você chegou a 100 etiquetas: “nova” não foi criada. Arquive alguma em Ajustes › Etiquetas.",
    );
  });
});

describe("interpretEntryTextAction", () => {
  const setFlag = async (enabled: boolean) => {
    await m.db.delete(m.s.featureFlagOverrides);
    await m.db
      .insert(m.s.featureFlagOverrides)
      .values({ userId: "ana", key: "lancamento_por_texto", enabled });
  };

  it("is refused with the flag off (the default)", async () => {
    await m.db.delete(m.s.featureFlagOverrides);
    const result = await m.action.interpretEntryTextAction({
      text: "café 12",
      kind: "expense",
    });
    expect(result?.serverError).toBe(m.entryText.TEXT_ENTRY_OFF);
    expect(result?.data).toBeUndefined();
  });

  it("answers with the flag on, validating the text", async () => {
    await setFlag(true);
    const ok = await m.action.interpretEntryTextAction({
      text: "  café 12  ",
      kind: "expense",
    });
    expect(ok?.data?.amountCents).toBe(1200);
    for (const text of ["", "   ", "a".repeat(201)]) {
      const bad = await m.action.interpretEntryTextAction({
        text,
        kind: "expense",
      });
      expect(bad?.validationErrors).toBeDefined();
    }
    const transfer = await m.action.interpretEntryTextAction({
      text: "x 1",
      kind: "transfer" as never,
    });
    expect(transfer?.validationErrors).toBeDefined();
  });

  it("refreshes only when a tag was created or restored", async () => {
    await setFlag(true);
    refresh.mockClear();
    await m.action.interpretEntryTextAction({ text: "x 5", kind: "expense" });
    expect(refresh).not.toHaveBeenCalled();
    await m.action.interpretEntryTextAction({
      text: "x 5 #refresh-tag",
      kind: "expense",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
