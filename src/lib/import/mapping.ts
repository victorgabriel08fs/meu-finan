/**
 * Column mapping of a CSV statement: which column holds the date, the
 * description and the amount (or separate debit and credit columns), found
 * from the header when it is recognisable and confirmed by the user when not
 * (doc 02 §6.13, step 2).
 */
import {
  type DecimalSeparator,
  detectDecimalSeparator,
  parseAmount,
} from "./amount";
import type { CsvRecord } from "./csv";
import { type DateFormat, detectDateFormat, parseDate } from "./date";
import { cleanDescription, isBalanceLine, normalizeText } from "./text";

export type AmountMapping =
  | {
      mode: "signed";
      amount: number;
      /** Optional D/C (débito/crédito, saída/entrada) column that sets the sign. */
      indicator: number | null;
    }
  | { mode: "split"; debit: number; credit: number };

export type CsvMapping = {
  /** Index into the records of the header row; data starts after it. Null: no header. */
  headerRow: number | null;
  date: number;
  /** One or two columns, joined with " - " ("Pix enviado - Fulano"). */
  description: number[];
  amount: AmountMapping;
  /** Column with the bank's own transaction id, when there is one. */
  id: number | null;
  dateFormat: DateFormat;
  decimal: DecimalSeparator;
};

export type MappingDetection = {
  /** Header labels, or "Coluna 1"… when the file has no header. */
  columns: string[];
  /** Best guess; null when not even a date and an amount column were found. */
  mapping: CsvMapping | null;
  /** True when the header was recognised and the guess reads the data. */
  confident: boolean;
};

export type MappedRow = {
  /** Line of the file (1-based), for messages. */
  line: number;
  occurredOn: string;
  /** Signed cents as in the file (negative = money out). */
  amountCents: number;
  description: string;
  /** The bank's own id from the `id` column. */
  sourceId: string | null;
};

/** Why a data line was left out. */
export type SkipReason = "date" | "amount" | "zero" | "future";

export type SkippedLine = { line: number; reason: SkipReason };

type Role =
  | "date"
  | "description"
  | "amount"
  | "debit"
  | "credit"
  | "indicator"
  | "id"
  | "balance";

/** Normalised header labels per role, by preference (the first wins a tie). */
const ROLE_LABELS: Record<Role, readonly string[]> = {
  date: [
    "data",
    "date",
    "dt",
    "data lancamento",
    "data do lancamento",
    "data de lancamento",
    "data movimento",
    "data mov",
    "data movimentacao",
    "data da movimentacao",
    "data transacao",
    "data da transacao",
    "data compra",
    "data da compra",
    "data operacao",
    "transaction date",
    "posted date",
    "dia",
    "data contabil",
    "data valor",
  ],
  description: [
    "descricao",
    "description",
    "historico",
    "lancamento",
    "lancamentos",
    "titulo",
    "title",
    "estabelecimento",
    "detalhes",
    "detalhe",
    "memo",
    "nome",
    "identificacao",
    "complemento",
    "beneficiario",
    "favorecido",
    "payee",
    "transacao",
    "movimentacao",
    "descricao do lancamento",
    "historico do lancamento",
  ],
  amount: [
    "valor",
    "valores",
    "amount",
    "value",
    "quantia",
    "montante",
    "valor rs",
    "valor em rs",
    "valor em reais",
    "valor brl",
    "valor lancamento",
    "valor do lancamento",
    "valor da transacao",
    "valor transacao",
    "valor final",
  ],
  debit: [
    "debito",
    "debitos",
    "saida",
    "saidas",
    "debit",
    "debits",
    "withdrawal",
    "withdrawals",
    "valor debito",
    "valor saida",
  ],
  credit: [
    "credito",
    "creditos",
    "entrada",
    "entradas",
    "credit",
    "credits",
    "deposit",
    "deposits",
    "valor credito",
    "valor entrada",
  ],
  indicator: [
    "d c",
    "c d",
    "dc",
    "cd",
    "deb cred",
    "cred deb",
    "debito credito",
    "credito debito",
    "natureza",
    "tipo lancamento",
    "tipo de lancamento",
    "sinal",
  ],
  id: [
    "identificador",
    "id",
    "fitid",
    "id transacao",
    "id da transacao",
    "transaction id",
    "codigo da transacao",
  ],
  balance: ["saldo", "saldos", "saldo do dia", "saldo final", "balance"],
};

/** First words that still give a role away ("data da compra efetiva"). */
const ROLE_PREFIXES: Partial<Record<Role, readonly string[]>> = {
  date: ["data", "date"],
  description: ["descricao", "historico", "description"],
  amount: ["valor", "amount"],
};

const looksLikeDate = (cell: string) =>
  parseDate(cell, "dmy") !== null || parseDate(cell, "ymd") !== null;

/** "Valor (R$)" → "valor", "Deb/Cred" → "deb cred", "Valor R$" → "valor rs". */
export function headerLabel(cell: string): string {
  return normalizeText(cell)
    .replace(/\([^)]*\)/g, " ")
    .replace(/r\$/g, "rs")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type RoleMatch = { role: Role; rank: number; exact: boolean };

function roleOf(cell: string): RoleMatch | null {
  const label = headerLabel(cell);
  if (label === "") return null;
  for (const role of Object.keys(ROLE_LABELS) as Role[]) {
    const rank = ROLE_LABELS[role].indexOf(label);
    if (rank !== -1) return { role, rank, exact: true };
  }
  if (/\b(saldo|balance)\b/.test(label))
    return { role: "balance", rank: 0, exact: true };
  const first = label.split(" ")[0] ?? "";
  for (const role of Object.keys(ROLE_PREFIXES) as Role[]) {
    if (ROLE_PREFIXES[role]?.includes(first)) {
      return { role, rank: 100, exact: false };
    }
  }
  return null;
}

/** Column of the best match for a role: exact labels first, then by rank. */
function pick(roles: (RoleMatch | null)[], role: Role): number | null {
  let best: number | null = null;
  for (const [index, match] of roles.entries()) {
    if (match?.role !== role) continue;
    const current = best === null ? null : roles[best];
    if (
      !current ||
      (match.exact && !current.exact) ||
      (match.exact === current.exact && match.rank < current.rank)
    ) {
      best = index;
    }
  }
  return best;
}

/** "D", "Débito", "Saída", "-" → money out; "C", "Crédito", "Entrada", "+" → in. */
export function parseIndicator(text: string): "-" | "+" | null {
  const value = normalizeText(text).replace(/[^a-z+-]/g, "");
  if (/^(d|db|dr|deb|debit|debito|debitos|s|saida|saidas|-)$/.test(value)) {
    return "-";
  }
  if (
    /^(c|cr|cred|credit|credito|creditos|e|entrada|entradas|\+)$/.test(value)
  ) {
    return "+";
  }
  return null;
}

/** The records after the header (all of them without a header). */
export function dataRecords(
  records: readonly CsvRecord[],
  headerRow: number | null,
): CsvRecord[] {
  return headerRow === null ? [...records] : records.slice(headerRow + 1);
}

/** Widest record among the first ones: the number of columns to offer. */
function columnCount(records: readonly CsvRecord[]): number {
  let count = 0;
  for (const record of records.slice(0, 50)) {
    count = Math.max(count, record.cells.length);
  }
  return count;
}

function columnNames(records: readonly CsvRecord[], headerRow: number | null) {
  const count = columnCount(records);
  const header = headerRow === null ? null : records[headerRow];
  return Array.from({ length: count }, (_, index) => {
    const label = header?.cells[index]?.trim();
    return label ? label.slice(0, 40) : `Coluna ${index + 1}`;
  });
}

const cellAt = (record: CsvRecord, index: number) =>
  (record.cells[index] ?? "").trim();

function amountCells(records: readonly CsvRecord[], amount: AmountMapping) {
  const columns =
    amount.mode === "signed" ? [amount.amount] : [amount.debit, amount.credit];
  return records.flatMap((record) =>
    columns.map((column) => cellAt(record, column)).filter(Boolean),
  );
}

/**
 * Finds the header and the columns. The header is the first of the opening
 * records with a date column and an amount (or debit and credit) column;
 * banks often put a few lines about the account above it. Without one, the
 * columns are guessed from the content and the guess is never "confident".
 */
export function detectMapping(records: readonly CsvRecord[]): MappingDetection {
  for (const [index, record] of records.slice(0, 20).entries()) {
    const roles = record.cells.map(roleOf);
    const date = pick(roles, "date");
    const amount = pick(roles, "amount");
    const debit = pick(roles, "debit");
    const credit = pick(roles, "credit");
    if (date === null) continue;
    if (amount === null && (debit === null || credit === null)) continue;
    // A data row whose description happens to say "data" is not a header.
    if (record.cells.some(looksLikeDate)) continue;

    const description = roles
      .map((match, column) => (match?.role === "description" ? column : -1))
      .filter((column) => column !== -1)
      .sort((a, b) => {
        const ra = roles[a];
        const rb = roles[b];
        // Exact labels before prefix guesses; then left to right.
        if (ra?.exact !== rb?.exact) return ra?.exact ? -1 : 1;
        return a - b;
      })
      .slice(0, 2)
      .sort((a, b) => a - b);
    const indicator = pick(roles, "indicator");
    const amountMapping: AmountMapping =
      amount !== null
        ? { mode: "signed", amount, indicator }
        : { mode: "split", debit: debit as number, credit: credit as number };
    const rows = dataRecords(records, index).slice(0, 200);
    const detectedFormat = detectDateFormat(
      rows.map((row) => cellAt(row, date)),
    );
    const mapping: CsvMapping = {
      headerRow: index,
      date,
      description:
        description.length > 0 ? description : fallbackDescription(roles),
      amount: amountMapping,
      id: pick(roles, "id"),
      dateFormat: detectedFormat ?? "dmy",
      decimal: detectDecimalSeparator(amountCells(rows, amountMapping)),
    };
    const { rows: mapped, skipped } = applyMapping(rows, {
      ...mapping,
      headerRow: null,
    });
    // Footer lines ("Total") and balances without a value count against it.
    const read = mapped.length / Math.max(1, mapped.length + skipped.length);
    return {
      columns: columnNames(records, index),
      mapping,
      confident:
        detectedFormat !== null &&
        description.length > 0 &&
        mapped.length > 0 &&
        read >= 0.8,
    };
  }
  return { ...guessWithoutHeader(records), confident: false };
}

/** Without a description column, the first column that is neither of the others. */
function fallbackDescription(roles: (RoleMatch | null)[]): number[] {
  const free = roles.findIndex(
    (match) =>
      !match ||
      !["date", "amount", "debit", "credit", "balance", "indicator"].includes(
        match.role,
      ),
  );
  return [free === -1 ? 0 : free];
}

/**
 * Header-less files: the date column is the one that parses as dates; the
 * amount is the numeric column that most often has cents (a document number
 * has none), the leftmost on a tie (a running balance usually comes last);
 * the description is the longest remaining text.
 */
function guessWithoutHeader(
  records: readonly CsvRecord[],
): Omit<MappingDetection, "confident"> {
  const columns = columnNames(records, null);
  const rows = records.slice(0, 100);
  const ratio = (test: (cell: string) => boolean, column: number) => {
    const cells = rows.map((row) => cellAt(row, column)).filter(Boolean);
    return cells.length === 0 ? 0 : cells.filter(test).length / cells.length;
  };
  const isAmount = (cell: string) =>
    !looksLikeDate(cell) &&
    /\d/.test(cell) &&
    (parseAmount(cell, ",") ?? parseAmount(cell, ".")) !== null;
  const hasCents = (cell: string) =>
    /[.,]\d{1,2}$/.test(cell.replace(/[^\d.,]/g, ""));

  const indexes = columns.map((_, index) => index);
  const date = indexes.find((column) => ratio(looksLikeDate, column) >= 0.8);
  if (date === undefined) return { columns, mapping: null };
  const [amount] = indexes
    .filter((column) => column !== date && ratio(isAmount, column) >= 0.8)
    .sort((a, b) => ratio(hasCents, b) - ratio(hasCents, a) || a - b);
  if (amount === undefined) return { columns, mapping: null };
  let description = indexes.find(
    (column) => column !== date && column !== amount,
  );
  let longest = -1;
  for (const column of indexes) {
    if (column === date || column === amount) continue;
    if (ratio(isAmount, column) >= 0.5) continue;
    const length =
      rows.reduce((sum, row) => sum + cellAt(row, column).length, 0) /
      Math.max(1, rows.length);
    if (length > longest) {
      longest = length;
      description = column;
    }
  }
  const amountMapping: AmountMapping = {
    mode: "signed",
    amount,
    indicator: null,
  };
  return {
    columns,
    mapping: {
      headerRow: null,
      date,
      description: [description ?? 0],
      amount: amountMapping,
      id: null,
      dateFormat:
        detectDateFormat(rows.map((row) => cellAt(row, date))) ?? "dmy",
      decimal: detectDecimalSeparator(amountCells(rows, amountMapping)),
    },
  };
}

function readAmount(
  record: CsvRecord,
  amount: AmountMapping,
  decimal: DecimalSeparator,
): number | null {
  if (amount.mode === "split") {
    const debitText = cellAt(record, amount.debit);
    const creditText = cellAt(record, amount.credit);
    if (debitText === "" && creditText === "") return null;
    const debit = debitText === "" ? 0 : parseAmount(debitText, decimal);
    const credit = creditText === "" ? 0 : parseAmount(creditText, decimal);
    if (debit === null || credit === null) return null;
    // Debits come either positive or already negative; credits the same.
    return Math.abs(credit) - Math.abs(debit);
  }
  const value = parseAmount(cellAt(record, amount.amount), decimal);
  if (value === null || amount.indicator === null) return value;
  const sign = parseIndicator(cellAt(record, amount.indicator));
  if (sign === null) return value;
  return sign === "-" ? -Math.abs(value) : Math.abs(value);
}

/**
 * Reads the data records with a mapping. Blank or footer lines without date
 * and amount, and balance lines without an amount, are dropped silently;
 * lines with only one of date and amount, or a zero amount, are reported in
 * `skipped`.
 */
export function applyMapping(
  records: readonly CsvRecord[],
  mapping: CsvMapping,
): { rows: MappedRow[]; skipped: SkippedLine[] } {
  const rows: MappedRow[] = [];
  const skipped: SkippedLine[] = [];
  const amountColumns =
    mapping.amount.mode === "signed"
      ? [mapping.amount.amount]
      : [mapping.amount.debit, mapping.amount.credit];
  for (const record of dataRecords(records, mapping.headerRow)) {
    const dateText = cellAt(record, mapping.date);
    const hasAmount = amountColumns.some(
      (column) => cellAt(record, column) !== "",
    );
    if (dateText === "" && !hasAmount) continue;
    const occurredOn = parseDate(dateText, mapping.dateFormat);
    if (occurredOn === null) {
      skipped.push({ line: record.line, reason: "date" });
      continue;
    }
    const description = cleanDescription(
      mapping.description
        .map((column) => cellAt(record, column))
        .filter(Boolean)
        .join(" - "),
    );
    const amountCents = readAmount(record, mapping.amount, mapping.decimal);
    // "Saldo anterior" lines often carry the balance in another column only.
    if (
      (amountCents === null || amountCents === 0) &&
      isBalanceLine(description)
    ) {
      continue;
    }
    if (amountCents === null) {
      skipped.push({ line: record.line, reason: "amount" });
      continue;
    }
    if (amountCents === 0) {
      skipped.push({ line: record.line, reason: "zero" });
      continue;
    }
    rows.push({
      line: record.line,
      occurredOn,
      amountCents,
      description,
      sourceId: mapping.id === null ? null : cellAt(record, mapping.id) || null,
    });
  }
  return { rows, skipped };
}

/** Column indexes used by a mapping, to check them against the file. */
export function mappingColumns(mapping: CsvMapping): number[] {
  const amount =
    mapping.amount.mode === "signed"
      ? [mapping.amount.amount, mapping.amount.indicator]
      : [mapping.amount.debit, mapping.amount.credit];
  return [mapping.date, ...mapping.description, ...amount, mapping.id].filter(
    (column): column is number => column !== null,
  );
}
