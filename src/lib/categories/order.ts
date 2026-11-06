/**
 * The order of the categories ("Mudar a ordem", doc 02 §6.14): a category
 * moves one place up or down among its siblings. A main category moves with
 * its subcategories, and a subcategory never leaves its main category. Pure,
 * shared by the order sheet and the server that saves it.
 */
import { categoryTree } from "./hierarchy";

type Node = { id: string; parentId: string | null };

export type MoveDirection = "up" | "down";

/** The siblings of `id` (same parent) in the order of `tree`, and its place. */
function placeAmongSiblings<T extends Node>(
  tree: readonly T[],
  id: string,
): { siblings: T[]; index: number } | null {
  const item = tree.find((category) => category.id === id);
  if (!item) return null;
  const siblings = tree.filter(
    (category) => category.parentId === item.parentId,
  );
  return { siblings, index: siblings.indexOf(item) };
}

/** Whether `id` can move one place `dir` (false at either end, or unknown). */
export function canMoveCategory(
  tree: readonly Node[],
  id: string,
  dir: MoveDirection,
): boolean {
  const place = placeAmongSiblings(tree, id);
  if (!place) return false;
  return dir === "up"
    ? place.index > 0
    : place.index < place.siblings.length - 1;
}

/**
 * `tree` (each category followed by its subcategories) with `id` swapped with
 * the previous or next sibling; a main category takes its subcategories
 * along. At either end (or for an unknown id) returns the same array.
 */
export function moveCategory<T extends Node>(
  tree: readonly T[],
  id: string,
  dir: MoveDirection,
): readonly T[] {
  const place = placeAmongSiblings(tree, id);
  if (!place || !canMoveCategory(tree, id, dir)) return tree;
  const item = place.siblings[place.index];
  const other = place.siblings[place.index + (dir === "up" ? -1 : 1)];
  if (!item || !other) return tree;
  // Swapping the two siblings and rebuilding the tree carries each one's
  // subcategories along and keeps every other order as it was.
  const swapped = tree.map((category) =>
    category === item ? other : category === other ? item : category,
  );
  return categoryTree(swapped);
}

/**
 * The `sort_order` of each category from an order of ids: 0…n−1 within each
 * group of siblings (same parent), so only the relative order among siblings
 * counts. Ids missing from `items` are ignored.
 */
export function siblingSortOrders(
  items: readonly Node[],
  orderedIds: readonly string[],
): Map<string, number> {
  const parentOf = new Map(items.map((item) => [item.id, item.parentId]));
  const next = new Map<string | null, number>();
  const orders = new Map<string, number>();
  for (const id of orderedIds) {
    if (!parentOf.has(id) || orders.has(id)) continue;
    const parentId = parentOf.get(id) ?? null;
    const position = next.get(parentId) ?? 0;
    orders.set(id, position);
    next.set(parentId, position + 1);
  }
  return orders;
}
