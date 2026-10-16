/**
 * OFX statements: SGML (OFX 1.x, leaf elements without closing tags) and XML
 * (OFX 2.x), bank and credit card. Reads every STMTTRN: DTPOSTED, TRNAMT,
 * FITID, NAME/MEMO and TRNTYPE.
 */
import { type DecimalSeparator, parseAmount } from "./amount";
import { isoDate } from "./date";
import type { SkippedLine } from "./mapping";
import { cleanDescription, normalizeText } from "./text";

export type OfxTransaction = {
  /** Line of the file where the STMTTRN starts (1-based). */
  line: number;
  occurredOn: string;
  /** Signed cents (negative = money out). */
  amountCents: number;
  description: string;
  fitId: string | null;
  type: string | null;
};

export type OfxStatement = {
  transactions: OfxTransaction[];
  skipped: SkippedLine[];
  /** Distinct accounts (ACCTID) with a statement in the file. */
  accounts: number;
  /** CURDEF of the statement, e.g. "BRL". */
  currency: string | null;
};

/** TRNTYPE values that take money out or bring it in (OFX 2.1.1 §11.4.4.3). */
const DEBIT_TYPES = new Set([
  "DEBIT",
  "PAYMENT",
  "CHECK",
  "FEE",
  "SRVCHG",
  "ATM",
  "POS",
  "DIRECTDEBIT",
  "REPEATPMT",
  "CASH",
]);
const CREDIT_TYPES = new Set(["CREDIT", "DEP", "INT", "DIV", "DIRECTDEP"]);

/** Aggregates that close a transaction left open by a missing </STMTTRN>. */
const CLOSERS = new Set([
  "STMTTRN",
  "BANKTRANLIST",
  "STMTRS",
  "CCSTMTRS",
  "STMTTRNRS",
  "CCSTMTTRNRS",
]);

/**
 * Whether the amounts follow the OFX convention (debits negative), judged by
 * the rows whose TRNTYPE says the direction; null without such rows or on a
 * tie. Decides the sign of a card file better than counting positives: a
 * month with few purchases and some refunds is still a normal file.
 */
export function signOrientation(
  transactions: readonly OfxTransaction[],
): "normal" | "inverted" | null {
  let agree = 0;
  let disagree = 0;
  for (const txn of transactions) {
    if (!txn.type) continue;
    const debit = DEBIT_TYPES.has(txn.type);
    if (!debit && !CREDIT_TYPES.has(txn.type)) continue;
    if (debit === txn.amountCents < 0) agree += 1;
    else disagree += 1;
  }
  if (agree === disagree) return null;
  return agree > disagree ? "normal" : "inverted";
}

export function isOfx(text: string): boolean {
  const head = text.slice(0, 4096);
  return /^\s*OFXHEADER\s*:/i.test(head) || /<\?OFX\b|<OFX>/i.test(head);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, body: string) => {
      if (body[0] === "#") {
        const code =
          body[1] === "x" || body[1] === "X"
            ? Number.parseInt(body.slice(2), 16)
            : Number.parseInt(body.slice(1), 10);
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      }
      return ENTITIES[body.toLowerCase()] ?? entity;
    },
  );
}

/** "20261014", "20261014120000[-3:BRT]" → "2026-10-14" (the date as posted). */
export function parseOfxDate(value: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!match) return null;
  return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** TRNAMT is "-64.50" by the spec; some banks write "-64,50". */
export function parseOfxAmount(value: string): number | null {
  const text = value.trim();
  const decimal: DecimalSeparator =
    text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
  return parseAmount(text, decimal);
}

/** NAME and MEMO, without repeating one that contains the other. */
function describe(name: string | undefined, memo: string | undefined) {
  const parts = [name, memo]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "");
  const [first = "", second] = parts;
  if (second === undefined) return cleanDescription(first);
  const a = normalizeText(first);
  const b = normalizeText(second);
  if (a.includes(b)) return cleanDescription(first);
  if (b.includes(a)) return cleanDescription(second);
  return cleanDescription(`${first} - ${second}`);
}

type OpenTransaction = { line: number; fields: Map<string, string> };

export function parseOfx(text: string): OfxStatement {
  const start = text.search(/<OFX[\s>]/i);
  const body = start === -1 ? text : text.slice(start);
  const lineOffset =
    start === -1 ? 0 : (text.slice(0, start).match(/\n/g)?.length ?? 0);

  const transactions: OfxTransaction[] = [];
  const skipped: SkippedLine[] = [];
  const accounts = new Set<string>();
  let currency: string | null = null;
  let open: OpenTransaction | null = null;
  let line = 1 + lineOffset;
  let scanned = 0;

  const close = () => {
    if (!open) return;
    const fields = open.fields;
    const occurredOn = parseOfxDate(
      fields.get("DTPOSTED") ?? fields.get("DTUSER") ?? "",
    );
    const amountCents = parseOfxAmount(fields.get("TRNAMT") ?? "");
    if (occurredOn === null) {
      skipped.push({ line: open.line, reason: "date" });
    } else if (amountCents === null) {
      skipped.push({ line: open.line, reason: "amount" });
    } else if (amountCents === 0) {
      skipped.push({ line: open.line, reason: "zero" });
    } else {
      transactions.push({
        line: open.line,
        occurredOn,
        amountCents,
        description: describe(fields.get("NAME"), fields.get("MEMO")),
        fitId: fields.get("FITID")?.trim() || null,
        type: fields.get("TRNTYPE")?.trim().toUpperCase() || null,
      });
    }
    open = null;
  };

  // Attributes (XML namespaces) are skipped, bounded so that a "<" without
  // its ">" cannot make every later match scan to the end of the file.
  const tag = /<(\/?)([A-Za-z0-9_.]{1,64})(?:\s[^<>]{0,256})?>([^<]*)/g;
  for (const match of body.matchAll(tag)) {
    const index = match.index ?? 0;
    for (let i = scanned; i < index; i += 1) {
      if (body.charCodeAt(i) === 10) line += 1;
    }
    scanned = index;
    const closing = match[1] === "/";
    const name = (match[2] ?? "").toUpperCase();
    const value = decodeEntities((match[3] ?? "").trim());

    if (closing) {
      if (CLOSERS.has(name)) close();
      continue;
    }
    if (name === "STMTTRN") {
      close();
      open = { line, fields: new Map() };
      continue;
    }
    if (CLOSERS.has(name)) close();
    if (open) {
      // NAME of a PAYEE aggregate does not replace the transaction's own.
      if (value !== "" && !open.fields.has(name)) open.fields.set(name, value);
      continue;
    }
    if (name === "ACCTID" && value !== "") accounts.add(value);
    if (name === "CURDEF" && value !== "" && currency === null) {
      currency = value.toUpperCase();
    }
  }
  close();

  // Some banks write every amount as positive and put the direction only in
  // TRNTYPE; in a file without a single negative amount, trust TRNTYPE.
  const unsigned =
    transactions.length > 0 &&
    transactions.every((txn) => txn.amountCents > 0) &&
    transactions.some((txn) => txn.type !== null && DEBIT_TYPES.has(txn.type));
  if (unsigned) {
    for (const txn of transactions) {
      if (txn.type && DEBIT_TYPES.has(txn.type)) {
        txn.amountCents = -Math.abs(txn.amountCents);
      } else if (txn.type && CREDIT_TYPES.has(txn.type)) {
        txn.amountCents = Math.abs(txn.amountCents);
      }
    }
  }

  return { transactions, skipped, accounts: accounts.size, currency };
}
