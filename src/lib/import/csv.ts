/**
 * CSV reading for bank exports: `;`, `,`, tab or `|` delimited, quoted fields
 * with "" escapes and line breaks inside quotes, CRLF/LF/CR line endings and
 * an optional byte order mark.
 */

export type Delimiter = ";" | "," | "\t" | "|";

/** In order of preference when two fit equally well (`;` is the pt-BR default). */
export const DELIMITERS: readonly Delimiter[] = [";", "\t", ",", "|"];

/** One record and the line of the file where it starts (1-based). */
export type CsvRecord = { line: number; cells: string[] };

/**
 * Splits the text into records. Cells are trimmed; records whose cells are
 * all empty (blank lines, ";;;") are dropped. Stops after `limit` records.
 */
export function parseCsv(
  text: string,
  delimiter: Delimiter,
  limit = Number.POSITIVE_INFINITY,
): CsvRecord[] {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endField = () => {
    cells.push(field.trim());
    field = "";
  };
  const endRecord = () => {
    endField();
    if (cells.some((cell) => cell !== "")) {
      records.push({ line: recordLine, cells });
    }
    cells = [];
  };

  while (index < text.length) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      if (char === "\n" || (char === "\r" && text[index + 1] !== "\n")) {
        line += 1;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === '"' && field.trim() === "") {
      inQuotes = true;
      field = "";
      index += 1;
      continue;
    }
    if (char === delimiter) {
      endField();
      index += 1;
      continue;
    }
    if (char === "\r" || char === "\n") {
      endRecord();
      if (records.length >= limit) return records;
      index += char === "\r" && text[index + 1] === "\n" ? 2 : 1;
      line += 1;
      recordLine = line;
      continue;
    }
    field += char;
    index += 1;
  }
  if (field !== "" || cells.length > 0) endRecord();
  return records;
}

/**
 * The delimiter that splits the first records most consistently: the share of
 * records with the most common cell count (at least 2 cells), then the larger
 * count. A `,`-delimited reading of a pt-BR file splits only where amounts
 * have decimals, so the header line breaks its consistency. Null when no
 * delimiter yields two or more columns.
 */
export function detectDelimiter(text: string): Delimiter | null {
  const sample = text.slice(0, 64 * 1024);
  let best: Delimiter | null = null;
  let bestScore = 0;
  let bestColumns = 0;
  for (const delimiter of DELIMITERS) {
    const records = parseCsv(sample, delimiter, 40);
    if (records.length === 0) continue;
    const frequency = new Map<number, number>();
    for (const record of records) {
      const count = record.cells.length;
      frequency.set(count, (frequency.get(count) ?? 0) + 1);
    }
    let columns = 0;
    let hits = 0;
    for (const [count, times] of frequency) {
      if (times > hits || (times === hits && count > columns)) {
        columns = count;
        hits = times;
      }
    }
    if (columns < 2) continue;
    const score = hits / records.length;
    if (
      score > bestScore + 1e-9 ||
      (Math.abs(score - bestScore) <= 1e-9 && columns > bestColumns)
    ) {
      best = delimiter;
      bestScore = score;
      bestColumns = columns;
    }
  }
  return best;
}
