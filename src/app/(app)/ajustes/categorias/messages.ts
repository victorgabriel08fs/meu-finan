/**
 * Copy of Ajustes › Categorias that depends on subcategories (doc 02 §6.14,
 * §10). Pure, so each case is tested.
 */

type ArchiveResult = {
  name: string;
  children: number;
  restoredParent: string | null;
};

function withChildren(children: number): string {
  if (children === 0) return "";
  return children === 1
    ? ", com 1 subcategoria"
    : `, com ${children} subcategorias`;
}

/** "Categoria Mercado arquivada, com 2 subcategorias." */
export function archivedMessage(result: ArchiveResult): string {
  return `Categoria ${result.name} arquivada${withChildren(result.children)}.`;
}

/**
 * "Categoria Mercado restaurada, com 2 subcategorias." · "Categorias Feira e
 * Mercado restauradas." (a subcategory brings its archived parent back).
 */
export function restoredMessage(result: ArchiveResult): string {
  if (result.restoredParent) {
    return `Categorias ${result.name} e ${result.restoredParent} restauradas.`;
  }
  return `Categoria ${result.name} restaurada${withChildren(result.children)}.`;
}

/** The archive confirmation, naming what goes along with the category. */
export function archiveDescription(children: readonly string[]): string {
  const rest =
    "saem das listas de escolha e dos orçamentos. Os lançamentos antigos continuam com";
  if (children.length === 0) {
    return "Ela sai das listas de escolha e dos orçamentos. Os lançamentos antigos continuam com ela, e dá para restaurar quando quiser.";
  }
  const who =
    children.length === 1
      ? `Ela e a subcategoria ${children[0]}`
      : `Ela e as ${children.length} subcategorias`;
  return `${who} ${rest} elas, e dá para restaurar quando quiser.`;
}

/** "Subcategoria Feira criada em Mercado." · "Categoria Academia criada." */
export function createdMessage(
  name: string,
  parentName: string | null,
): string {
  return parentName
    ? `Subcategoria ${name} criada em ${parentName}.`
    : `Categoria ${name} criada.`;
}
