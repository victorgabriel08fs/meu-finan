/**
 * Copy of Ajustes › Etiquetas (doc 02 §6.14, §10.3). Pure, so each case is
 * tested.
 */

/** "Nenhum lançamento" · "1 lançamento" · "12 lançamentos". */
export function entriesLabel(count: number): string {
  if (count === 0) return "Nenhum lançamento";
  return `${count} ${count === 1 ? "lançamento" : "lançamentos"}`;
}

/** "Etiqueta viagem criada." · from an archived one: "Etiqueta viagem restaurada." */
export function createdMessage({
  name,
  restored,
}: {
  name: string;
  restored: boolean;
}): string {
  return restored ? restoredMessage(name) : `Etiqueta ${name} criada.`;
}

export function archivedMessage(name: string): string {
  return `Etiqueta ${name} arquivada.`;
}

export function restoredMessage(name: string): string {
  return `Etiqueta ${name} restaurada.`;
}
