/**
 * Categories and subcategories (doc 01 §6.3, doc 02 §6.4, §6.5): one level
 * only, a subcategory always under a main category. Pure, shared by the
 * server pages and the client lists.
 */

type Named = { id: string; name: string };

/**
 * How a category reads in a list: "Mercado › Feira" for a subcategory, the
 * plain name for a main one. `categories` is where the parent is looked up
 * (archived ones included, or an archived parent's child reads as a main
 * category); a parent missing from it leaves the plain name.
 */
export function categoryLabel(
  category: { name: string; parentId: string | null },
  categories: readonly Named[],
): string {
  const parent = category.parentId
    ? categories.find((item) => item.id === category.parentId)
    : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

type Kind = "income" | "expense";

/** What a parent candidate needs to be checked. */
export type ParentCandidate = {
  id: string;
  kind: Kind;
  parentId: string | null;
  archived: boolean;
};

/**
 * Why `parent` cannot take the category in (null when it can), in this
 * order: the category itself, a category that has subcategories (archived
 * ones too: one level only, so no grandchildren and no cycles), a parent that
 * is itself a subcategory, an archived parent, a parent of the other type.
 * `categoryId` is null for a category being created.
 */
export function parentBlocker({
  categoryId,
  kind,
  parent,
  hasChildren,
}: {
  categoryId: string | null;
  kind: Kind;
  parent: ParentCandidate;
  hasChildren: boolean;
}): string | null {
  if (parent.id === categoryId) {
    return "Uma categoria não pode ficar dentro dela mesma.";
  }
  if (hasChildren) {
    return "Uma categoria com subcategorias não pode ficar dentro de outra.";
  }
  if (parent.parentId !== null) {
    return "Escolha uma categoria principal como mãe.";
  }
  if (parent.archived) return "A categoria mãe está arquivada.";
  if (parent.kind !== kind) {
    return kind === "expense"
      ? "Escolha uma categoria mãe de despesa."
      : "Escolha uma categoria mãe de receita.";
  }
  return null;
}

/**
 * The categories a category of `kind` can go into ("Subcategoria de"): the
 * active main categories of the same type, except itself (`id`, null when
 * creating), in the given order.
 */
export function parentOptions<T extends ParentCandidate>(
  categories: readonly T[],
  { id, kind }: { id: string | null; kind: Kind },
): T[] {
  return categories.filter(
    (category) =>
      category.id !== id &&
      category.kind === kind &&
      category.parentId === null &&
      !category.archived,
  );
}
