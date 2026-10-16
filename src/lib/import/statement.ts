/**
 * From the bytes of a statement file to the rows to review (doc 02 §6.13):
 * file checks, decoding, OFX or CSV parsing, the CSV column mapping, stable
 * external ids, sign convention and flags. Pure: the Server Action calls it
 * with the uploaded bytes and the database work happens afterwards.
 */
import {
  type CsvRecord,
  type Delimiter,
  detectDelimiter,
  parseCsv,
} from "./csv";
import { addDaysIso } from "./date";
import { MAX_IMPORT_ROWS } from "./files";
import { assignExternalIds, type IdentifiableRow } from "./hash";
import {
  applyMapping,
  type CsvMapping,
  dataRecords,
  detectMapping,
  mappingColumns,
  type SkippedLine,
} from "./mapping";
import { isOfx, parseOfx, signOrientation } from "./ofx";
import {
  decodeText,
  detectBinary,
  isBalanceLine,
  isCardPaymentLine,
} from "./text";

/** How many data records of a CSV go to the mapping preview. */
export const CSV_SAMPLE_SIZE = 20;
/** How many skipped lines are listed (the count covers all of them). */
export const MAX_SKIPPED_LISTED = 50;
/** Used when a row has no description at all. */
export const DEFAULT_DESCRIPTION = "Lançamento importado";
/** Entries dated later than this many days from today are left out. */
const MAX_DAYS_AHEAD = 366;

export type ImportFormatName = "ofx" | "csv";

const formatInt = new Intl.NumberFormat("pt-BR");

export type StatementOptions = {
  /** CSV only: the columns confirmed by the user. */
  mapping?: CsvMapping | null;
  /** True flips every sign; null/undefined decides from the file. */
  invertSign?: boolean | null;
};

/** balance: a "SALDO" line; payment: an invoice payment seen from the card. */
export type StatementRowFlag = "balance" | "payment" | null;

export type StatementRow = {
  line: number;
  occurredOn: string;
  /** Signed cents (negative = money out), after any sign inversion. */
  amountCents: number;
  description: string;
  externalId: string;
  flag: StatementRowFlag;
};

export type CsvSetup = {
  delimiter: Delimiter;
  columns: string[];
  /** First data records, raw, for the mapping preview. */
  sample: CsvRecord[];
  /** Detected (or the one in use); null when nothing was recognised. */
  mapping: CsvMapping | null;
  confident: boolean;
};

/**
 * inverted: signs were flipped (a card file with purchases as positives, or
 * the user asked) · mostly-positive: nearly everything is money in, which
 * usually means the file uses the opposite convention.
 */
export type SignNotice = "inverted" | "mostly-positive" | null;

export type AnalysisResult =
  | { ok: false; error: string }
  | {
      ok: true;
      stage: "mapping";
      format: "csv";
      csv: CsvSetup;
      invertSign: boolean;
      /** Why the mapping in use did not work, when there was one. */
      problem: string | null;
    }
  | {
      ok: true;
      stage: "review";
      format: ImportFormatName;
      rows: StatementRow[];
      skipped: SkippedLine[];
      skippedCount: number;
      warnings: string[];
      csv: CsvSetup | null;
      invertSign: boolean;
      signNotice: SignNotice;
    };

type AnalyzeInput = {
  bytes: Uint8Array;
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
  /** Credit card account: purchases are expected, payments are flagged. */
  isCard: boolean;
  options?: StatementOptions;
};

type RawRow = IdentifiableRow & { line: number };

export function analyzeStatement({
  bytes,
  today,
  isCard,
  options = {},
}: AnalyzeInput): AnalysisResult {
  const binary = detectBinary(bytes);
  if (binary === "spreadsheet") {
    return {
      ok: false,
      error:
        "Esse arquivo é uma planilha do Excel. Abra no Excel e salve como CSV, ou baixe o extrato em OFX.",
    };
  }
  if (binary === "pdf") {
    return {
      ok: false,
      error: "Esse arquivo é um PDF. Baixe o extrato em OFX ou CSV.",
    };
  }
  if (binary) {
    return {
      ok: false,
      error: "Não conseguimos ler esse arquivo. Envie um OFX ou CSV.",
    };
  }
  const { text } = decodeText(bytes);
  if (text.trim() === "") return { ok: false, error: "O arquivo está vazio." };

  if (isOfx(text)) {
    const statement = parseOfx(text);
    if (statement.transactions.length === 0) {
      return {
        ok: false,
        error: "Não encontramos lançamentos neste arquivo OFX.",
      };
    }
    const warnings: string[] = [];
    if (statement.accounts > 1) {
      warnings.push(
        `O arquivo tem extratos de ${statement.accounts} contas. Todos os lançamentos vão para a conta escolhida.`,
      );
    }
    if (statement.currency && statement.currency !== "BRL") {
      warnings.push(
        `Os valores do arquivo estão em ${statement.currency} e entram como reais.`,
      );
    }
    const raw: RawRow[] = statement.transactions.map((txn) => ({
      line: txn.line,
      occurredOn: txn.occurredOn,
      amountCents: txn.amountCents,
      description: txn.description,
      sourceId: txn.fitId,
    }));
    return finish({
      format: "ofx",
      raw,
      ids: assignExternalIds(raw, "ofx"),
      skipped: statement.skipped,
      warnings,
      csv: null,
      today,
      isCard,
      invertSign: options.invertSign,
      orientation: signOrientation(statement.transactions),
    });
  }

  const delimiter = detectDelimiter(text);
  if (!delimiter) {
    return {
      ok: false,
      error:
        "Não reconhecemos as colunas deste arquivo. O CSV precisa ter data, descrição e valor separados por ponto e vírgula, vírgula ou tabulação.",
    };
  }
  const records = parseCsv(text, delimiter);
  const detection = detectMapping(records);
  const mapping = options.mapping ?? detection.mapping;
  const setup = (used: CsvMapping | null, confident: boolean): CsvSetup => ({
    delimiter,
    columns: detection.columns,
    sample: dataRecords(records, used?.headerRow ?? null).slice(
      0,
      CSV_SAMPLE_SIZE,
    ),
    mapping: used,
    confident,
  });
  const askMapping = (
    used: CsvMapping | null,
    problem: string | null,
  ): AnalysisResult => ({
    ok: true,
    stage: "mapping",
    format: "csv",
    csv: setup(used, false),
    invertSign:
      options.invertSign ??
      (used !== null &&
        isCard &&
        mostlyPositive(applyMapping(records, used).rows, 0.5)),
    problem,
  });

  if (!mapping) return askMapping(null, null);
  if (!options.mapping && !detection.confident)
    return askMapping(mapping, null);
  const outOfRange =
    mappingColumns(mapping).some(
      (column) => column < 0 || column >= Math.max(1, detection.columns.length),
    ) ||
    (mapping.headerRow !== null && mapping.headerRow >= records.length);
  if (outOfRange) {
    return askMapping(detection.mapping, "Confira as colunas escolhidas.");
  }

  const { rows, skipped } = applyMapping(records, mapping);
  if (rows.length === 0) {
    return askMapping(
      mapping,
      "Nenhuma linha foi reconhecida com essas colunas. Confira a data, o valor e os formatos.",
    );
  }
  const raw: RawRow[] = rows.map((row) => ({ ...row }));
  return finish({
    format: "csv",
    raw,
    ids: assignExternalIds(raw, "id"),
    skipped,
    warnings: [],
    csv: setup(mapping, detection.confident || Boolean(options.mapping)),
    today,
    isCard,
    invertSign: options.invertSign,
    orientation: null,
  });
}

function mostlyPositive(
  rows: readonly { amountCents: number }[],
  share: number,
) {
  if (rows.length === 0) return false;
  return rows.filter((row) => row.amountCents > 0).length / rows.length > share;
}

function finish(input: {
  format: ImportFormatName;
  raw: RawRow[];
  ids: string[];
  skipped: SkippedLine[];
  warnings: string[];
  csv: CsvSetup | null;
  today: string;
  isCard: boolean;
  invertSign: boolean | null | undefined;
  /** What the OFX TRNTYPEs say about the sign convention, when they say it. */
  orientation: "normal" | "inverted" | null;
}): AnalysisResult {
  const latest = addDaysIso(input.today, MAX_DAYS_AHEAD);
  const skipped = [...input.skipped];
  const kept: { row: RawRow; externalId: string }[] = [];
  for (const [index, row] of input.raw.entries()) {
    if (row.occurredOn > latest) {
      skipped.push({ line: row.line, reason: "future" });
      continue;
    }
    kept.push({ row, externalId: input.ids[index] ?? "" });
  }
  if (kept.length === 0) {
    return { ok: false, error: "Não encontramos lançamentos neste arquivo." };
  }
  if (kept.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `Este arquivo tem ${formatInt.format(kept.length)} lançamentos. Importe até ${formatInt.format(MAX_IMPORT_ROWS)} por vez: baixe um período menor no seu banco.`,
    };
  }

  const rawRows = kept.map(({ row }) => row);
  // OFX transaction types settle the convention. Otherwise: a card statement
  // is mostly purchases, so if they came positive the file uses the opposite
  // convention; elsewhere that is only pointed out.
  const invertSign =
    input.invertSign ??
    (input.orientation !== null
      ? input.orientation === "inverted"
      : input.isCard && mostlyPositive(rawRows, 0.5));
  const signNotice: SignNotice = invertSign
    ? "inverted"
    : input.orientation !== "normal" &&
        rawRows.length >= 3 &&
        mostlyPositive(rawRows, input.isCard ? 0.5 : 0.8)
      ? "mostly-positive"
      : null;

  const rows: StatementRow[] = kept.map(({ row, externalId }) => {
    const amountCents = invertSign ? -row.amountCents : row.amountCents;
    const description = row.description || DEFAULT_DESCRIPTION;
    return {
      line: row.line,
      occurredOn: row.occurredOn,
      amountCents,
      description,
      externalId,
      flag: isBalanceLine(description)
        ? "balance"
        : input.isCard && amountCents > 0 && isCardPaymentLine(description)
          ? "payment"
          : null,
    };
  });
  skipped.sort((a, b) => a.line - b.line);

  return {
    ok: true,
    stage: "review",
    format: input.format,
    rows,
    skipped: skipped.slice(0, MAX_SKIPPED_LISTED),
    skippedCount: skipped.length,
    warnings: input.warnings,
    csv: input.csv,
    invertSign,
    signNotice,
  };
}
