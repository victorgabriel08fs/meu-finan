import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canMoveCategory, moveCategory, siblingSortOrders } from "./order";

type Node = { id: string; parentId: string | null };

const main = (id: string): Node => ({ id, parentId: null });
const child = (id: string, parentId: string): Node => ({ id, parentId });

// Moradia; Mercado › Feira, Padaria; Transporte › Combustível.
const tree: Node[] = [
  main("housing"),
  main("market"),
  child("fair", "market"),
  child("bakery", "market"),
  main("transport"),
  child("fuel", "transport"),
];
const ids = (items: readonly Node[]) => items.map((item) => item.id);

describe("moveCategory", () => {
  it("moves a main category with its subcategories", () => {
    expect(ids(moveCategory(tree, "market", "up"))).toEqual([
      "market",
      "fair",
      "bakery",
      "housing",
      "transport",
      "fuel",
    ]);
    expect(ids(moveCategory(tree, "market", "down"))).toEqual([
      "housing",
      "transport",
      "fuel",
      "market",
      "fair",
      "bakery",
    ]);
  });

  it("moves a subcategory among its siblings only", () => {
    expect(ids(moveCategory(tree, "bakery", "up"))).toEqual([
      "housing",
      "market",
      "bakery",
      "fair",
      "transport",
      "fuel",
    ]);
    // First and last of Mercado: it never leaves its main category.
    expect(canMoveCategory(tree, "fair", "up")).toBe(false);
    expect(canMoveCategory(tree, "bakery", "down")).toBe(false);
    expect(canMoveCategory(tree, "fuel", "up")).toBe(false);
  });

  it("returns the same array at either end or for an unknown id", () => {
    expect(canMoveCategory(tree, "housing", "up")).toBe(false);
    expect(canMoveCategory(tree, "transport", "down")).toBe(false);
    expect(moveCategory(tree, "housing", "up")).toBe(tree);
    expect(moveCategory(tree, "transport", "down")).toBe(tree);
    expect(moveCategory(tree, "fair", "up")).toBe(tree);
    expect(canMoveCategory(tree, "gone", "down")).toBe(false);
    expect(moveCategory(tree, "gone", "down")).toBe(tree);
  });
});

describe("siblingSortOrders", () => {
  it("numbers each group of siblings from 0, in the given order", () => {
    const orders = siblingSortOrders(tree, [
      "market",
      "bakery",
      "fair",
      "housing",
      "transport",
      "fuel",
    ]);
    expect(Object.fromEntries(orders)).toEqual({
      market: 0,
      bakery: 0,
      fair: 1,
      housing: 1,
      transport: 2,
      fuel: 0,
    });
  });

  it("ignores unknown and repeated ids", () => {
    const orders = siblingSortOrders(tree, ["gone", "housing", "housing"]);
    expect(Object.fromEntries(orders)).toEqual({ housing: 0 });
  });
});

/** A tree of 1–6 main categories with 0–4 subcategories each, in tree order. */
const trees = fc
  .array(fc.integer({ min: 0, max: 4 }), { minLength: 1, maxLength: 6 })
  .map((sizes) =>
    sizes.flatMap((size, m) => [
      main(`m${m}`),
      ...Array.from({ length: size }, (_, c) => child(`m${m}c${c}`, `m${m}`)),
    ]),
  );

/** Every subcategory comes right after its main category's block. */
function isTree(items: readonly Node[]): boolean {
  let current: string | null = null;
  for (const item of items) {
    if (item.parentId === null) current = item.id;
    else if (item.parentId !== current) return false;
  }
  return true;
}

describe("moveCategory properties", () => {
  it("keeps every category, each subcategory under its main one", () => {
    fc.assert(
      fc.property(
        trees,
        fc.array(fc.tuple(fc.nat(), fc.constantFrom("up", "down" as const))),
        (start, moves) => {
          let current: readonly Node[] = start;
          for (const [pick, dir] of moves) {
            const id = current[pick % current.length]?.id ?? "";
            current = moveCategory(current, id, dir);
            expect(isTree(current)).toBe(true);
          }
          expect([...ids(current)].sort()).toEqual([...ids(start)].sort());
        },
      ),
      { numRuns: 200 },
    );
  });

  it("up then down brings the same order back", () => {
    fc.assert(
      fc.property(trees, fc.nat(), (start, pick) => {
        const id = start[pick % start.length]?.id ?? "";
        if (!canMoveCategory(start, id, "up")) {
          expect(moveCategory(start, id, "up")).toBe(start);
          return;
        }
        const moved = moveCategory(start, id, "up");
        expect(canMoveCategory(moved, id, "down")).toBe(true);
        expect(ids(moveCategory(moved, id, "down"))).toEqual(ids(start));
      }),
      { numRuns: 200 },
    );
  });
});
