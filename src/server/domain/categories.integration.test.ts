// Subcategories (doc 01 §6.3, doc 02 §6.14): one level, same type, the
// person's own active main category as parent, archive and restore in pairs,
// against a real (in-memory) Postgres.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Categories = typeof import("./categories");
type Admin = typeof import("./category-admin");

let c: Categories;
let admin: Admin;
let ana: import("./context").UserContext;
let bruno: import("./context").UserContext;
const ids = {} as Record<
  "market" | "transport" | "health" | "salary" | "brunoMarket",
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
    { id: "ana", name: "Ana", email: "ana@exemplo.com" },
    { id: "bruno", name: "Bruno", email: "bruno@exemplo.com" },
  ]);
  await ensureOwnerDefaults("ana");
  await ensureOwnerDefaults("bruno");
  c = await import("./categories");
  admin = await import("./category-admin");
  const context = await import("./context");
  ana = await context.getUserContext("ana", { now: NOW });
  bruno = await context.getUserContext("bruno", { now: NOW });

  const find = async (userId: string, name: string) => {
    const found = (await c.listCategories(userId)).find(
      (category) => category.name === name,
    );
    if (!found) throw new Error(`categoria ${name}`);
    return found.id;
  };
  ids.market = await find("ana", "Mercado");
  ids.transport = await find("ana", "Transporte");
  ids.health = await find("ana", "Saúde");
  ids.salary = await find("ana", "Salário");
  ids.brunoMarket = await find("bruno", "Mercado");
}, 120_000);

async function all(userId = "ana") {
  return admin.listCategoriesForAdmin(userId);
}

async function byId(id: string, userId = "ana") {
  const found = (await all(userId)).find((category) => category.id === id);
  if (!found) throw new Error(`categoria ${id}`);
  return found;
}

function sub(
  name: string,
  parentId: string,
  kind: "income" | "expense" = "expense",
) {
  return c.createCategory("ana", {
    kind,
    name,
    icon: "carrot",
    color: "cat-1",
    parentId,
  });
}

describe("creating a subcategory", () => {
  it("goes under an active main category of the same type", async () => {
    const fair = await sub("Feira", ids.market);
    expect(await byId(fair)).toMatchObject({
      name: "Feira",
      kind: "expense",
      parentId: ids.market,
      archived: false,
    });
  });

  it("never under someone else's category", async () => {
    await expect(sub("Feira", ids.brunoMarket)).rejects.toThrow(
      "Categoria não encontrad",
    );
    // Nor does Bruno see anything new.
    expect(
      (await all("bruno")).filter((item) => item.parentId !== null),
    ).toEqual([]);
  });

  it("says why a parent cannot take it", async () => {
    const fair = (await all()).find((item) => item.name === "Feira");
    if (!fair) throw new Error("Feira");
    await expect(sub("Orgânicos", fair.id)).rejects.toThrow(
      "Escolha uma categoria principal como mãe.",
    );
    await expect(sub("Bônus", ids.market, "income")).rejects.toThrow(
      "Escolha uma categoria mãe de receita.",
    );
    const trip = await c.createCategory("ana", {
      kind: "expense",
      name: "Passeios",
      icon: "plane",
      color: "cat-2",
    });
    await admin.setCategoryArchived("ana", trip, true);
    await expect(sub("Praia", trip)).rejects.toThrow(
      "A categoria mãe está arquivada.",
    );
  });

  it("is unique by name under its parent, not across parents", async () => {
    await expect(sub("Feira", ids.market)).rejects.toThrow(
      "Já existe uma subcategoria com esse nome em Mercado.",
    );
    const other = await sub("Feira", ids.health);
    expect((await byId(other)).parentId).toBe(ids.health);
    // A main category may share a subcategory's name.
    const main = await c.createCategory("ana", {
      kind: "expense",
      name: "Feira",
      icon: "carrot",
      color: "cat-1",
    });
    expect((await byId(main)).parentId).toBeNull();
    await expect(
      c.createCategory("ana", {
        kind: "expense",
        name: "Feira",
        icon: "carrot",
        color: "cat-1",
      }),
    ).rejects.toThrow("Já existe uma categoria com esse nome.");
  });
});

describe("moving a category", () => {
  it("puts a main category inside another and back", async () => {
    const pharmacy = await c.createCategory("ana", {
      kind: "expense",
      name: "Farmácia",
      icon: "pill",
      color: "cat-3",
    });
    await admin.updateCategory(ana, pharmacy, { parentId: ids.health });
    expect((await byId(pharmacy)).parentId).toBe(ids.health);
    // undefined leaves the parent alone; a rename keeps it.
    await admin.updateCategory(ana, pharmacy, { name: "Drogaria" });
    expect(await byId(pharmacy)).toMatchObject({
      name: "Drogaria",
      parentId: ids.health,
    });
    await admin.updateCategory(ana, pharmacy, { parentId: null });
    expect((await byId(pharmacy)).parentId).toBeNull();
  });

  it("blocks itself, a subcategory, an archived parent and the other type", async () => {
    const fair = (await all()).find(
      (item) => item.name === "Feira" && item.parentId === ids.market,
    );
    if (!fair) throw new Error("Feira");
    await expect(
      admin.updateCategory(ana, ids.transport, { parentId: ids.transport }),
    ).rejects.toThrow("Uma categoria não pode ficar dentro dela mesma.");
    await expect(
      admin.updateCategory(ana, ids.transport, { parentId: fair.id }),
    ).rejects.toThrow("Escolha uma categoria principal como mãe.");
    await expect(
      admin.updateCategory(ana, ids.transport, { parentId: ids.salary }),
    ).rejects.toThrow("Escolha uma categoria mãe de despesa.");
    const passeios = (await all()).find((item) => item.name === "Passeios");
    if (!passeios) throw new Error("Passeios");
    await expect(
      admin.updateCategory(ana, ids.transport, { parentId: passeios.id }),
    ).rejects.toThrow("A categoria mãe está arquivada.");
    expect((await byId(ids.transport)).parentId).toBeNull();
  });

  it("keeps a category with subcategories (active or archived) at the top", async () => {
    await expect(
      admin.updateCategory(ana, ids.market, { parentId: ids.transport }),
    ).rejects.toThrow(
      "Uma categoria com subcategorias não pode ficar dentro de outra.",
    );
    // Only an archived child left: still blocked.
    const leisure = await c.createCategory("ana", {
      kind: "expense",
      name: "Hobbies",
      icon: "palette",
      color: "cat-4",
    });
    const paint = await sub("Pintura", leisure);
    await admin.setCategoryArchived("ana", paint, true);
    await expect(
      admin.updateCategory(ana, leisure, { parentId: ids.transport }),
    ).rejects.toThrow(
      "Uma categoria com subcategorias não pode ficar dentro de outra.",
    );
  });

  it("checks the name at the level it goes to", async () => {
    // Health already has a "Feira": the main "Feira" cannot go there…
    const main = (await all()).find(
      (item) => item.name === "Feira" && item.parentId === null,
    );
    if (!main) throw new Error("Feira principal");
    await expect(
      admin.updateCategory(ana, main.id, { parentId: ids.health }),
    ).rejects.toThrow("Já existe uma subcategoria com esse nome em Saúde.");
    // …nor can Saúde's "Feira" go back to the top, where "Feira" exists.
    const healthFair = (await all()).find(
      (item) => item.name === "Feira" && item.parentId === ids.health,
    );
    if (!healthFair) throw new Error("Feira de Saúde");
    await expect(
      admin.updateCategory(ana, healthFair.id, { parentId: null }),
    ).rejects.toThrow("Já existe uma categoria com esse nome.");
    // Renaming inside a parent checks that parent's children.
    const fair = (await all()).find(
      (item) => item.name === "Feira" && item.parentId === ids.market,
    );
    if (!fair) throw new Error("Feira");
    const bakery = await sub("Padaria", ids.market);
    await expect(
      admin.updateCategory(ana, bakery, { name: "Feira" }),
    ).rejects.toThrow("Já existe uma subcategoria com esse nome em Mercado.");
  });

  it("never touches someone else's category, on either side", async () => {
    await expect(
      admin.updateCategory(ana, ids.brunoMarket, { name: "Meu" }),
    ).rejects.toThrow("Categoria não encontrad");
    await expect(
      admin.updateCategory(ana, ids.transport, { parentId: ids.brunoMarket }),
    ).rejects.toThrow("Categoria não encontrad");
    await expect(
      admin.updateCategory(bruno, ids.brunoMarket, { parentId: ids.market }),
    ).rejects.toThrow("Categoria não encontrad");
    expect((await byId(ids.brunoMarket, "bruno")).name).toBe("Mercado");
  });

  it("blocks a category with a budget this month or ahead (D1)", async () => {
    const budgets = await import("./budgets");
    const pets = await c.createCategory("ana", {
      kind: "expense",
      name: "Bichos",
      icon: "paw-print",
      color: "cat-5",
    });
    // A budget in a past month does not block.
    await budgets.upsertBudget(ana, {
      categoryId: pets,
      month: "2026-09",
      amountCents: 10_000,
    });
    await admin.updateCategory(ana, pets, { parentId: ids.health });
    await admin.updateCategory(ana, pets, { parentId: null });
    await budgets.upsertBudget(ana, {
      categoryId: pets,
      month: "2026-11",
      amountCents: 10_000,
    });
    await expect(
      admin.updateCategory(ana, pets, { parentId: ids.health }),
    ).rejects.toThrow(
      "Esta categoria tem orçamento neste mês ou nos próximos. Apague o orçamento para colocá-la dentro de outra.",
    );
  });

  it("never leaves a grandchild when a child is created as its parent moves", async () => {
    for (let round = 0; round < 4; round += 1) {
      const x = await c.createCategory("ana", {
        kind: "expense",
        name: `Grupo ${round}`,
        icon: "folder",
        color: "cat-6",
      });
      const results = await Promise.allSettled([
        sub(`Filha ${round}`, x),
        admin.updateCategory(ana, x, { parentId: ids.transport }),
      ]);
      // One of the two wins; never both.
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const list = await all();
      const parents = new Map(list.map((item) => [item.id, item.parentId]));
      for (const item of list) {
        if (item.parentId) expect(parents.get(item.parentId)).toBeNull();
      }
    }
  });
});

describe("archiving and restoring", () => {
  it("archives a parent with its active children, and restores the same ones", async () => {
    const home = await c.createCategory("ana", {
      kind: "expense",
      name: "Casa",
      icon: "house",
      color: "cat-1",
    });
    const cleaning = await sub("Limpeza", home);
    const garden = await sub("Jardim", home);
    const repairs = await sub("Reparos", home);
    // Archived before: stays archived when the parent comes back.
    await admin.setCategoryArchived("ana", repairs, true);

    expect(await admin.setCategoryArchived("ana", home, true)).toEqual({
      name: "Casa",
      children: 2,
      restoredParent: null,
      moved: null,
    });
    for (const id of [home, cleaning, garden, repairs]) {
      expect((await byId(id)).archived).toBe(true);
    }
    // Nothing of Bruno's moved.
    expect((await all("bruno")).some((item) => item.archived)).toBe(false);

    expect(await admin.setCategoryArchived("ana", home, false)).toEqual({
      name: "Casa",
      children: 2,
      restoredParent: null,
      moved: null,
    });
    expect((await byId(home)).archived).toBe(false);
    expect((await byId(cleaning)).archived).toBe(false);
    expect((await byId(garden)).archived).toBe(false);
    expect((await byId(repairs)).archived).toBe(true);
  });

  it("restoring a child of an archived parent restores the parent", async () => {
    const casa = (await all()).find((item) => item.name === "Casa");
    const garden = (await all()).find((item) => item.name === "Jardim");
    if (!casa || !garden) throw new Error("Casa");
    await admin.setCategoryArchived("ana", casa.id, true);
    expect(await admin.setCategoryArchived("ana", garden.id, false)).toEqual({
      name: "Jardim",
      children: 0,
      restoredParent: "Casa",
      moved: null,
    });
    expect((await byId(casa.id)).archived).toBe(false);
    // Limpeza went with Casa and stays archived: only the asked child came.
    const cleaning = (await all()).find((item) => item.name === "Limpeza");
    expect(cleaning?.archived).toBe(true);
  });

  it("does nothing when the category is already as asked, and never for someone else", async () => {
    expect(await admin.setCategoryArchived("ana", ids.market, false)).toEqual({
      name: "Mercado",
      children: 0,
      restoredParent: null,
      moved: null,
    });
    await expect(
      admin.setCategoryArchived("ana", ids.brunoMarket, true),
    ).rejects.toThrow("Categoria não encontrad");
    expect((await byId(ids.brunoMarket, "bruno")).archived).toBe(false);
  });
});
