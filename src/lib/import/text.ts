/**
 * Text helpers for bank statements: byte decoding (Brazilian banks still send
 * windows-1252), normalisation for comparisons and clean-up of descriptions.
 * Pure and runtime-agnostic (TextDecoder is a web standard), so the client can
 * use them in previews too.
 */

export type TextEncodingName =
  | "utf-8"
  | "utf-16le"
  | "utf-16be"
  | "windows-1252";

export type DecodedText = { text: string; encoding: TextEncodingName };

/** `ledger.description` is limited to 120 characters (code points). */
export const MAX_DESCRIPTION_LENGTH = 120;

const startsWith = (bytes: Uint8Array, prefix: readonly number[]) =>
  prefix.every((byte, index) => bytes[index] === byte);

/**
 * Decodes the bytes of a statement. A byte order mark wins; otherwise strict
 * UTF-8 is tried first and anything that is not valid UTF-8 is read as
 * windows-1252, which also covers ISO-8859-1 (the WHATWG decoders treat them
 * as one). Declared charsets (`CHARSET:1252` in OFX headers, `encoding=` in
 * XML) are deliberately not trusted: banks often declare one and send the
 * other, and valid multi-byte UTF-8 practically never happens by accident in
 * windows-1252 text.
 */
export function decodeText(bytes: Uint8Array): DecodedText {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) {
    return {
      text: new TextDecoder("utf-8").decode(bytes.subarray(3)),
      encoding: "utf-8",
    };
  }
  if (startsWith(bytes, [0xff, 0xfe])) {
    return {
      text: new TextDecoder("utf-16le").decode(bytes.subarray(2)),
      encoding: "utf-16le",
    };
  }
  if (startsWith(bytes, [0xfe, 0xff])) {
    return {
      text: new TextDecoder("utf-16be").decode(bytes.subarray(2)),
      encoding: "utf-16be",
    };
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
    };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(bytes),
      encoding: "windows-1252",
    };
  }
}

export type BinaryKind = "spreadsheet" | "pdf" | "binary";

/**
 * Recognises files that are not text (an .xlsx renamed to .csv, a PDF
 * statement), so the user gets a specific message instead of garbage.
 */
export function detectBinary(bytes: Uint8Array): BinaryKind | null {
  // ZIP (xlsx, ods) and OLE2 (legacy xls).
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "spreadsheet";
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return "spreadsheet";
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  const utf16 =
    startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff]);
  if (!utf16 && bytes.subarray(0, 4096).includes(0)) return "binary";
  return null;
}

/** Lowercase, without accents, single spaces: for comparisons and hashes. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Key that groups descriptions of the same merchant: normalised, punctuation
 * turned into spaces, and without tokens that carry digits (dates, card
 * numbers, authorisation codes, "2/6" installments) or single letters.
 * "UBER *TRIP 12/10 SAO PAULO" → "uber trip sao paulo".
 */
export function descriptionKey(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 1 && !/\d/.test(token))
    .join(" ");
}

/**
 * A description as it will be stored: control characters removed, single
 * spaces, at most {@link MAX_DESCRIPTION_LENGTH} code points (an ellipsis
 * marks the cut).
 */
export function cleanDescription(value: string): string {
  const text = value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(text);
  if (chars.length <= MAX_DESCRIPTION_LENGTH) return text;
  return `${chars
    .slice(0, MAX_DESCRIPTION_LENGTH - 1)
    .join("")
    .trimEnd()}…`;
}

/** Lines such as "SALDO ANTERIOR" or "S A L D O": balances, not entries. */
export function isBalanceLine(description: string): boolean {
  return /^(s a l d o|saldo|sdo)\b/.test(normalizeText(description));
}

/** "Pagamento recebido", "PGTO FATURA": an invoice payment seen from the card. */
export function isCardPaymentLine(description: string): boolean {
  return /\b(pagamento|pagto|pgto|pag fatura)\b/.test(
    normalizeText(description),
  );
}
