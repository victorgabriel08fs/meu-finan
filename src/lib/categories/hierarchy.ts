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

/**
 * The categories as a tree for a list: each one followed by its
 * subcategories, keeping the given order among siblings. A subcategory whose
 * parent is not in the list goes to the end.
 */
export function categoryTree<T extends { id: string; parentId: string | null }>(
  categories: readonly T[],
): T[] {
  const placed = new Set<string>();
  const tree: T[] = [];
  const place = (category: T) => {
    if (placed.has(category.id)) return;
    placed.add(category.id);
    tree.push(category);
    for (const child of categories) {
      if (child.parentId === category.id) place(child);
    }
  };
  for (const category of categories) {
    if (category.parentId === null) place(category);
  }
  // Orphans (and anything caught in a cycle), with their own children.
  for (const category of categories) place(category);
  return tree;
}

/** What a category needs to be checked as the destination of a move. */
export type MoveCandidate = {
  id: string;
  kind: Kind;
  parentId: string | null;
  archived: boolean;
};

/**
 * Why `target` cannot take the entries of `source` (null when it can), in
 * this order: the category itself, one of the categories being archived along
 * (`excluded`: the source's active subcategories when archiving it), an
 * archived target, a target of the other type and, when merging a category
 * that has subcategories, a target that is itself a subcategory (they move
 * into it, and there is only one level).
 */
export function moveTargetBlocker({
  mode,
  source,
  target,
  excluded,
}: {
  mode: "merge" | "archive";
  source: { id: string; name: string; kind: Kind; hasChildren: boolean };
  target: MoveCandidate;
  excluded: readonly string[];
}): string | null {
  if (target.id === source.id) return "Escolha outra categoria.";
  if (excluded.includes(target.id)) {
    return "Escolha uma categoria que não esteja sendo arquivada.";
  }
  if (target.archived) return "Esta categoria está arquivada.";
  if (target.kind !== source.kind) {
    return source.kind === "expense"
      ? "Escolha uma categoria de despesa."
      : "Escolha uma categoria de receita.";
  }
  if (mode === "merge" && source.hasChildren && target.parentId !== null) {
    return `${source.name} tem subcategorias: escolha uma categoria principal para mesclar.`;
  }
  return null;
}

/**
 * The categories that can take the entries of a category being archived or
 * merged ("Passar para", "Mesclar com"): active, of `kind`, outside
 * `excluded` (the category and what goes along with it) and, with
 * `mainOnly`, main categories only; in tree order, each with its label
 * ("Mercado › Feira").
 */
export function moveTargets<T extends MoveCandidate & { name: string }>(
  categories: readonly T[],
  {
    kind,
    excluded,
    mainOnly,
  }: { kind: Kind; excluded: readonly string[]; mainOnly: boolean },
): (T & { label: string })[] {
  return categoryTree(categories)
    .filter(
      (category) =>
        !category.archived &&
        category.kind === kind &&
        !excluded.includes(category.id) &&
        (!mainOnly || category.parentId === null),
    )
    .map((category) => ({
      ...category,
      label: categoryLabel(category, categories),
    }));
}
