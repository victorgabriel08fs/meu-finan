/**
 * Search in choice lists (doc 02 §4.4): accents and case do not matter, so
 * "saude" finds "Saúde" and "acai" finds "Açaí".
 */

/** The text without accents (ç included) and in lowercase, for comparing. */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Whether `text` contains `query`; an empty (or blank) query matches all. */
export function matchesSearch(text: string, query: string): boolean {
  const needle = foldText(query.trim());
  return needle === "" || foldText(text).includes(needle);
}
