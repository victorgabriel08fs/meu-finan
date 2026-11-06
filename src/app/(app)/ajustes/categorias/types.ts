import type { CategoryKind } from "./messages";

export type { CategoryKind };

/** A category of Ajustes › Categorias, with what moving it would carry. */
export type ManagedCategory = {
  id: string;
  kind: CategoryKind;
  name: string;
  icon: string;
  color: string;
  parentId: string | null;
  archived: boolean;
  /** Entries (not deleted, any status) of the category itself. */
  entries: number;
  /** It has a budget this financial month or a later one. */
  upcomingBudget: boolean;
};

/** Name of the main category a budget ends up in ("Mercado" for "Feira"). */
export function rootName(
  category: Pick<ManagedCategory, "name" | "parentId">,
  categories: readonly Pick<ManagedCategory, "id" | "name">[],
): string {
  const parent = category.parentId
    ? categories.find((item) => item.id === category.parentId)
    : undefined;
  return parent?.name ?? category.name;
}
