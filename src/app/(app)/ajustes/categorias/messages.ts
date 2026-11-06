/**
 * Copy of Ajustes › Categorias that depends on subcategories, on entries
 * passed to another category and on the order (doc 02 §6.14, §10). Pure, so
 * each case is tested.
 */

export type CategoryKind = "expense" | "income";

type ArchiveResult = {
  name: string;
  children: number;
  restoredParent: string | null;
  /** Where the entries went when archiving passed them on. */
  moved?: { entries: number; to: string } | null;
};

function withChildren(children: number): string {
  if (children === 0) return "";
  return children === 1
    ? ", com 1 subcategoria"
    : `, com ${children} subcategorias`;
}

/** "1 despesa" · "32 despesas" · "1 receita" · "2 receitas". */
export function entriesCount(kind: CategoryKind, count: number): string {
  const noun = kind === "expense" ? "despesa" : "receita";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * "Categoria Mercado arquivada, com 2 subcategorias." · with the entries
 * passed on: "… 32 despesas foram para Restaurantes." ("1 despesa foi").
 */
export function archivedMessage(
  result: ArchiveResult,
  kind: CategoryKind,
): string {
  const base = `Categoria ${result.name} arquivada${withChildren(result.children)}.`;
  const { moved } = result;
  if (!moved || moved.entries === 0) return base;
  const verb = moved.entries === 1 ? "foi" : "foram";
  return `${base} ${entriesCount(kind, moved.entries)} ${verb} para ${moved.to}.`;
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
export function archiveDescription(
  children: readonly string[],
  moving = false,
): string {
  if (moving) {
    if (children.length === 0) {
      return "Ela sai das listas de escolha e dos orçamentos, e os lançamentos passam para a categoria que você escolher. Dá para restaurar quando quiser.";
    }
    const who =
      children.length === 1
        ? `Ela e a subcategoria ${children[0]} saem`
        : `Ela e as ${children.length} subcategorias saem`;
    return `${who} das listas de escolha e dos orçamentos, e os lançamentos delas passam para a categoria que você escolher. Dá para restaurar quando quiser.`;
  }
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

/** The question of the archive step: what to do with the entries. */
export function archiveQuestion(
  kind: CategoryKind,
  hasChildren: boolean,
): string {
  const noun = kind === "expense" ? "despesas" : "receitas";
  return hasChildren
    ? `Quer passar as ${noun} dela e das subcategorias para outra?`
    : `Quer passar as ${noun} desta categoria para outra?`;
}

/** The confirm button of the archive step when the entries are passed on. */
export function archiveAndMoveLabel(kind: CategoryKind): string {
  return kind === "expense"
    ? "Arquivar e passar despesas"
    : "Arquivar e passar receitas";
}

/** The budget of the source adds up into the target's main category. */
export function budgetMergeNote(from: string, intoRoot: string): string {
  return `O orçamento de ${from} se soma ao de ${intoRoot}.`;
}

/**
 * What archiving with "Sim" will do, read aloud as it changes: "32 despesas,
 * inclusive as agendadas, vão para Restaurantes. Não dá para desfazer: se
 * restaurar Mercado, ela volta vazia."
 */
export function archiveMoveSummary({
  kind,
  entries,
  to,
  name,
}: {
  kind: CategoryKind;
  entries: number;
  to: string;
  name: string;
}): string {
  const lead =
    entries === 1
      ? `${entriesCount(kind, 1)} vai`
      : `${entriesCount(kind, entries)}, inclusive as agendadas, vão`;
  return `${lead} para ${to}. Não dá para desfazer: se restaurar ${name}, ela volta vazia.`;
}

/** The merge confirmation under the title. */
export function mergeDescription(
  name: string,
  children: readonly string[],
): string {
  const base = `Os lançamentos, as recorrências e o orçamento de ${name} passam para a categoria escolhida, e ${name} fica arquivada, vazia.`;
  if (children.length === 0) return base;
  return children.length === 1
    ? `${base} A subcategoria ${children[0]} passa para dentro dela.`
    : `${base} As ${children.length} subcategorias passam para dentro dela.`;
}

/**
 * "32 despesas vão para Mercado. Não dá para desfazer." · with nothing to
 * pass: "Não há despesas para passar. Feira fica arquivada."
 */
export function mergeSummary(
  kind: CategoryKind,
  entries: number,
  to: string,
  name?: string,
): string {
  if (entries === 0) {
    const noun = kind === "expense" ? "despesas" : "receitas";
    return name
      ? `Não há ${noun} para passar. ${name} fica arquivada.`
      : `Não há ${noun} para passar.`;
  }
  const verb = entries === 1 ? "vai" : "vão";
  return `${entriesCount(kind, entries)} ${verb} para ${to}. Não dá para desfazer.`;
}

/** "Categoria Supermercado mesclada com Mercado." */
export function mergedMessage(name: string, into: string): string {
  return `Categoria ${name} mesclada com ${into}.`;
}

/** The merge select has nothing to offer. */
export function noMergeTarget(kind: CategoryKind): string {
  return kind === "expense"
    ? "Não há outra categoria de despesa para mesclar."
    : "Não há outra categoria de receita para mesclar.";
}

/** "Ordem das despesas" · "Ordem das receitas". */
export function orderTitle(kind: CategoryKind): string {
  return kind === "expense" ? "Ordem das despesas" : "Ordem das receitas";
}

/** "Ordem das despesas salva." */
export function orderSavedMessage(kind: CategoryKind): string {
  return `${orderTitle(kind)} salva.`;
}

/**
 * "Mercado na posição 2 de 16." · "Feira na posição 1 de 2 em Mercado." (the
 * position among its siblings, which is where a subcategory can move).
 */
export function orderPosition(
  name: string,
  position: number,
  total: number,
  parent: string | null,
): string {
  const where = `${name} na posição ${position} de ${total}`;
  return parent ? `${where} em ${parent}.` : `${where}.`;
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
