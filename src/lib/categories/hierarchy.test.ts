import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  categoryTree,
  moveTargetBlocker,
  moveTargets,
  parentBlocker,
  parentOptions,
} from "./hierarchy";

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

describe("categoryTree", () => {
  it("puts each subcategory after its parent, keeping the sibling order", () => {
    const ids = categoryTree([
      { id: "fair", parentId: "market" },
      { id: "housing", parentId: null },
      { id: "market", parentId: null },
      { id: "bakery", parentId: "market" },
      { id: "lost", parentId: "gone" },
    ]).map((item) => item.id);
    expect(ids).toEqual(["housing", "market", "fair", "bakery", "lost"]);
  });
});

describe("moveTargetBlocker", () => {
  const source = {
    id: "market",
    name: "Mercado",
    kind: "expense" as const,
    hasChildren: false,
  };
  const target = {
    id: "food",
    kind: "expense" as const,
    parentId: null,
    archived: false,
  };
  const check = (
    patch: Partial<Parameters<typeof moveTargetBlocker>[0]> = {},
  ) =>
    moveTargetBlocker({
      mode: "merge",
      source,
      target,
      excluded: [],
      ...patch,
    });

  it("lets an active category of the same type take the entries", () => {
    expect(check()).toBeNull();
    expect(check({ mode: "archive", excluded: ["market"] })).toBeNull();
    // A category without subcategories may go into a subcategory.
    expect(check({ target: { ...target, parentId: "home" } })).toBeNull();
    // Archiving one with subcategories may pass them to a subcategory.
    expect(
      check({
        mode: "archive",
        source: { ...source, hasChildren: true },
        target: { ...target, parentId: "home" },
      }),
    ).toBeNull();
  });

  it("names each reason", () => {
    expect(check({ target: { ...target, id: "market" } })).toBe(
      "Escolha outra categoria.",
    );
    expect(check({ mode: "archive", excluded: ["market", "food"] })).toBe(
      "Escolha uma categoria que não esteja sendo arquivada.",
    );
    expect(check({ target: { ...target, archived: true } })).toBe(
      "Esta categoria está arquivada.",
    );
    expect(check({ target: { ...target, kind: "income" } })).toBe(
      "Escolha uma categoria de despesa.",
    );
    expect(
      check({
        source: { ...source, kind: "income" },
        target: { ...target, kind: "expense" },
      }),
    ).toBe("Escolha uma categoria de receita.");
    expect(
      check({
        source: { ...source, hasChildren: true },
        target: { ...target, parentId: "home" },
      }),
    ).toBe(
      "Mercado tem subcategorias: escolha uma categoria principal para mesclar.",
    );
  });

  it("checks in order: itself, excluded, archived, type, a subcategory", () => {
    const worst = {
      id: "market",
      kind: "income" as "income" | "expense",
      parentId: "home",
      archived: true,
    };
    const merging = { ...source, hasChildren: true };
    const at = (patch: Partial<typeof worst>, excluded: string[] = []) =>
      check({ source: merging, target: { ...worst, ...patch }, excluded });
    expect(at({}, ["market"])).toBe("Escolha outra categoria.");
    expect(at({ id: "fair" }, ["fair"])).toBe(
      "Escolha uma categoria que não esteja sendo arquivada.",
    );
    expect(at({ id: "fair" })).toBe("Esta categoria está arquivada.");
    expect(at({ id: "fair", archived: false })).toBe(
      "Escolha uma categoria de despesa.",
    );
    expect(at({ id: "fair", archived: false, kind: "expense" })).toBe(
      "Mercado tem subcategorias: escolha uma categoria principal para mesclar.",
    );
  });
});

describe("moveTargets", () => {
  const item = (
    id: string,
    name: string,
    parentId: string | null = null,
    patch: Partial<{ kind: "income" | "expense"; archived: boolean }> = {},
  ) => ({
    id,
    name,
    parentId,
    kind: "expense" as const,
    archived: false,
    ...patch,
  });
  const list = [
    item("market", "Mercado"),
    item("transport", "Transporte"),
    item("fuel", "Combustível", "transport"),
    item("fair", "Feira", "market"),
    item("bakery", "Padaria", "market", { archived: true }),
    item("pets", "Pets", null, { archived: true }),
    item("salary", "Salário", null, { kind: "income" }),
  ];

  it("offers the active categories of the type in tree order, with labels", () => {
    expect(
      moveTargets(list, {
        kind: "expense",
        excluded: ["transport", "fuel"],
        mainOnly: false,
      }).map((target) => target.label),
    ).toEqual(["Mercado", "Mercado › Feira"]);
    expect(
      moveTargets(list, { kind: "income", excluded: [], mainOnly: false }).map(
        (target) => target.id,
      ),
    ).toEqual(["salary"]);
  });

  it("only main categories with mainOnly", () => {
    expect(
      moveTargets(list, {
        kind: "expense",
        excluded: ["market"],
        mainOnly: true,
      }).map((target) => target.id),
    ).toEqual(["transport"]);
  });
});
