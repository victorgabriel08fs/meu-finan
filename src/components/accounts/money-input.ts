import { brlParts, MINUS } from "@/lib/format/money";

/**
 * Pure helpers behind <MoneyField>: pt-BR typing ⇄ integer cents. While the
 * field has focus it holds plain text ("1234,5"); on blur it shows the grouped
 * amount ("1.234,50"). Typing follows doc 02 §5.5: "35" is R$ 35,00, the
 * comma starts the cents (at most 2), leading zeros collapse and the integer
 * part takes at most 9 digits (the Server Actions accept up to R$ 999.999.999,99).
 */

export const MAX_INTEGER_DIGITS = 9;

const MINUS_SIGNS = /[-−]/;

/**
 * Normalizes what the user typed or pasted. A "," is the decimal separator;
 * without one, a "." followed by at most 2 digits is too (keyboards that only
 * offer "."), otherwise dots are thousands groups ("1.234" = 1234 reais).
 */
export function sanitizeMoneyTyping(
  raw: string,
  options: { allowNegative?: boolean } = {},
): string {
  const negative = Boolean(options.allowNegative) && MINUS_SIGNS.test(raw);
  const text = raw.replace(/[^\d.,]/g, "");

  let separator = text.lastIndexOf(",");
  if (separator === -1) {
    const dot = text.lastIndexOf(".");
    if (dot !== -1 && text.length - dot - 1 <= 2) separator = dot;
  }

  const integerSource = separator === -1 ? text : text.slice(0, separator);
  let integer = integerSource
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, MAX_INTEGER_DIGITS);
  const sign = negative ? MINUS : "";

  if (separator === -1) return `${sign}${integer}`;
  const fraction = text
    .slice(separator + 1)
    .replace(/\D/g, "")
    .slice(0, 2);
  if (integer === "") integer = "0";
  return `${sign}${integer},${fraction}`;
}

/** Cents of a typed amount, or null while there is no digit yet. */
export function moneyTextToCents(text: string): number | null {
  const clean = sanitizeMoneyTyping(text, { allowNegative: true });
  const match = /^(−?)(\d*)(?:,(\d{0,2}))?$/.exec(clean);
  if (!match) return null;
  const [, sign, integer = "", fraction] = match;
  if (integer === "" && fraction === undefined) return null;
  const cents =
    Number(integer || "0") * 100 + Number((fraction ?? "").padEnd(2, "0"));
  return sign && cents !== 0 ? -cents : cents;
}

/**
 * Text for the field: "1.234,56" at rest (`grouping`), "1234,56" while
 * editing; "" for no value. Negative amounts start with "−".
 */
export function formatMoneyText(
  cents: number | null,
  options: { grouping?: boolean } = {},
): string {
  if (cents === null || !Number.isSafeInteger(cents)) return "";
  const parts = brlParts(cents);
  const integer =
    options.grouping === false
      ? parts.integer.replace(/\D/g, "")
      : parts.integer;
  return `${parts.sign}${integer}${parts.decimal}`;
}

/** Flips the sign of the editing text ("12,40" ⇄ "−12,40"; "" ⇄ "−"). */
export function toggleMoneySign(text: string): string {
  return text.startsWith(MINUS) ? text.slice(1) : `${MINUS}${text}`;
}
