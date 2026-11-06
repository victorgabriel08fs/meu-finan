import { describe, expect, it } from "vitest";
import { categoryLabel, parentBlocker, parentOptions } from "./hierarchy";

const market = { id: "market", name: "Mercado", parentId: null };
const fair = { id: "fair", name: "Feira", parentId: "market" };
const bakery = { id: "bakery", name: "Padaria", parentId: "market" };
const orphan = { id: "orphan", name: "Avulsa", parentId: "gone" };
const categories = [market, fair, bakery, orphan];

describe("categoryLabel", () => {
  it("reads a subcategory as “Parent › Child”", () => {
    expect(categoryLabel(fair, categories)).toBe("Mercado › Feira");
    expect(categoryLabel(bakery, categories)).toBe("Mercado › Padaria");
  });

  it("keeps the plain name of a main category", () => {
    expect(categoryLabel(market, categories)).toBe("Mercado");
  });

  it("keeps the plain name when the parent is not in the list", () => {
    expect(categoryLabel(orphan, categories)).toBe("Avulsa");
    expect(categoryLabel(fair, [])).toBe("Feira");
  });
});

describe("parentBlocker", () => {
  const main = {
    id: "market",
    kind: "expense" as const,
    parentId: null,
    archived: false,
  };
  const check = (patch: Partial<Parameters<typeof parentBlocker>[0]> = {}) =>
    parentBlocker({
      categoryId: "fair",
      kind: "expense",
      parent: main,
      hasChildren: false,
      ...patch,
    });

  it("lets a category go into an active main category of its type", () => {
    expect(check()).toBeNull();
    expect(check({ categoryId: null })).toBeNull();
  });

  it("names each reason", () => {
    expect(check({ categoryId: "market" })).toBe(
      "Uma categoria não pode ficar dentro dela mesma.",
    );
    expect(check({ hasChildren: true })).toBe(
      "Uma categoria com subcategorias não pode ficar dentro de outra.",
    );
    expect(check({ parent: { ...main, parentId: "food" } })).toBe(
      "Escolha uma categoria principal como mãe.",
    );
    expect(check({ parent: { ...main, archived: true } })).toBe(
      "A categoria mãe está arquivada.",
    );
    expect(check({ parent: { ...main, kind: "income" } })).toBe(
      "Escolha uma categoria mãe de despesa.",
    );
    expect(
      check({ kind: "income", parent: { ...main, kind: "expense" } }),
    ).toBe("Escolha uma categoria mãe de receita.");
  });

  it("checks in order: itself, children, a subcategory, archived, type", () => {
    const worst = {
      id: "fair",
      kind: "income" as const,
      parentId: "food",
      archived: true,
    };
    expect(check({ parent: worst, hasChildren: true })).toBe(
      "Uma categoria não pode ficar dentro dela mesma.",
    );
    expect(
      check({ parent: { ...worst, id: "other" }, hasChildren: true }),
    ).toBe("Uma categoria com subcategorias não pode ficar dentro de outra.");
    expect(check({ parent: { ...worst, id: "other" } })).toBe(
      "Escolha uma categoria principal como mãe.",
    );
    expect(check({ parent: { ...worst, id: "other", parentId: null } })).toBe(
      "A categoria mãe está arquivada.",
    );
  });
});

describe("parentOptions", () => {
  const list = [
    {
      id: "housing",
      kind: "expense" as const,
      parentId: null,
      archived: false,
    },
    { id: "market", kind: "expense" as const, parentId: null, archived: false },
    {
      id: "fair",
      kind: "expense" as const,
      parentId: "market",
      archived: false,
    },
    { id: "pets", kind: "expense" as const, parentId: null, archived: true },
    { id: "salary", kind: "income" as const, parentId: null, archived: false },
  ];
  const ids = (items: { id: string }[]) => items.map((item) => item.id);

  it("offers the active main categories of the type, in order", () => {
    expect(ids(parentOptions(list, { id: null, kind: "expense" }))).toEqual([
      "housing",
      "market",
    ]);
    expect(ids(parentOptions(list, { id: null, kind: "income" }))).toEqual([
      "salary",
    ]);
  });

  it("leaves the category itself out", () => {
    expect(ids(parentOptions(list, { id: "market", kind: "expense" }))).toEqual(
      ["housing"],
    );
  });
});
