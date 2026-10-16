/**
 * "Exportar lançamentos (CSV)": a spreadsheet that opens right in the
 * Brazilian Excel — UTF-8 with BOM, `;` between columns, decimal comma,
 * dd/mm/yyyy dates, CRLF line ends — and that cannot run formulas.
 */

export const EXPORT_COLUMNS = [
  "Data",
  "Descrição",
  "Categoria",
  "Conta",
  "Tipo",
  "Status",
  "Valor",
  "Parcela",
  "Observação",
] as const;

export type ExportKind = "income" | "expense" | "transfer" | "adjustment";
export type ExportStatus = "paid" | "pending";

/** One ledger row; a transfer appears once per leg, with its own account. */
export type ExportRow = {
  occurredOn: string;
  description: string;
  categoryName: string | null;
  accountName: string;
  kind: ExportKind;
  status: ExportStatus;
  /** Signed cents (negative = money out of `accountName`). */
  amountCents: number;
  installment: { number: number; count: number } | null;
  notes: string | null;
};

const KIND_LABELS: Record<ExportKind, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência",
  adjustment: "Ajuste de saldo",
};

const STATUS_LABELS: Record<ExportStatus, string> = {
  paid: "Pago",
  pending: "Pendente",
};

const BOM = "﻿";
const LINE_END = "\r\n";
/** Characters that make Excel/Sheets read a cell as a formula (OWASP CSV injection). */
const FORMULA_START = /^[=+\-@\t\r＝＋－＠]/;
/** Plain numbers ("-64,50") are values, not formulas: they keep their sign. */
const PLAIN_NUMBER = /^[-+]?\d+(?:[.,]\d+)?$/;

/**
 * One cell: text that would start a formula gets a leading apostrophe
 * (shown as text, never evaluated); cells with the delimiter, quotes or line
 * breaks are quoted, with quotes doubled.
 */
export function csvCell(value: string, delimiter = ";"): string {
  let text = value;
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  if (
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/** Rows into CSV text: BOM, `;`, CRLF after every row. */
export function toCsv(rows: readonly (readonly string[])[], delimiter = ";") {
  return (
    BOM +
    rows
      .map((row) => row.map((cell) => csvCell(cell, delimiter)).join(delimiter))
      .map((line) => line + LINE_END)
      .join("")
  );
}

/** "-6450" → "-64,50": no thousands separator, so every spreadsheet reads it. */
export function csvAmount(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`cents must be a safe integer (received ${cents})`);
  }
  const magnitude = Math.abs(cents);
  const reais = Math.floor(magnitude / 100);
  const rest = String(magnitude % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${reais},${rest}`;
}

/** "2026-10-14" → "14/10/2026". */
export function csvDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function transactionsCsv(rows: readonly ExportRow[]): string {
  return toCsv([
    [...EXPORT_COLUMNS],
    ...rows.map((row) => [
      csvDate(row.occurredOn),
      row.description,
      row.categoryName ?? "",
      row.accountName,
      KIND_LABELS[row.kind],
      STATUS_LABELS[row.status],
      csvAmount(row.amountCents),
      // "2 de 6", not "2/6": Excel would turn that into the 2nd of June.
      row.installment
        ? `${row.installment.number} de ${row.installment.count}`
        : "",
      row.notes ?? "",
    ]),
  ]);
}
