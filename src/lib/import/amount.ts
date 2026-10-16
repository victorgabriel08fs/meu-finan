/**
 * Amounts from statements, in either convention: "1.234,56" (pt-BR) or
 * "1,234.56". Parsed digit by digit into integer cents, never through a float.
 */

export type DecimalSeparator = "," | ".";

/** Largest amount accepted, in cents (R$ 999.999.999,99), same as the actions. */
export const MAX_AMOUNT_CENTS = 99_999_999_999;

const MINUS_SIGNS = /[−‒–—﹣－]/g;
const CURRENCY = /R\$|US\$|BRL|\$/gi;

/**
 * Signed cents for an amount cell, or null when it is not an amount. Accepts
 * a sign before or after the number ("-64,50", "64,50-"), parentheses for
 * negatives ("(64,50)"), a trailing D/C marker ("64,50 D" is a debit),
 * currency symbols and spaces (also NBSP) anywhere. Thousands separators must
 * be in groups of three, so "1234.56" read with a decimal comma is rejected
 * rather than silently becoming 123.456 reais. More than two decimal places
 * round half away from zero.
 */
export function parseAmount(
  raw: string,
  decimal: DecimalSeparator,
): number | null {
  let text = raw.replace(MINUS_SIGNS, "-").replace(CURRENCY, "");
  text = text.replace(/[\s  ]+/g, "");
  if (text === "") return null;

  // Every way of writing the sign; conflicting ones ("-64,50 C") are rejected.
  const signs: string[] = [];
  const marker = /^(.+?)([DC])$/i.exec(text);
  if (marker?.[1] && /[\d)]$/.test(marker[1])) {
    text = marker[1];
    signs.push(marker[2]?.toUpperCase() === "D" ? "-" : "+");
  }
  const parenthesised = /^\((.+)\)$/.exec(text);
  if (parenthesised?.[1]) {
    text = parenthesised[1];
    signs.push("-");
  }
  const leading = /^([-+])(.+)$/.exec(text);
  const trailing = leading ? null : /^(.+?)([-+])$/.exec(text);
  if (leading?.[1] && leading[2]) {
    signs.push(leading[1]);
    text = leading[2];
  } else if (trailing?.[1] && trailing[2]) {
    signs.push(trailing[2]);
    text = trailing[1];
  }
  if (signs.includes("-") && signs.includes("+")) return null;
  const negative = signs.includes("-");

  const thousands = decimal === "," ? "." : ",";
  const decimalIndex = text.lastIndexOf(decimal);
  const integerPart = decimalIndex === -1 ? text : text.slice(0, decimalIndex);
  const fractionPart = decimalIndex === -1 ? "" : text.slice(decimalIndex + 1);
  if (integerPart.includes(decimal) || !/^\d*$/.test(fractionPart)) {
    return null;
  }
  const grouped = new RegExp(`^\\d{1,3}(\\${thousands}\\d{3})+$`);
  let digits: string;
  if (/^\d*$/.test(integerPart)) digits = integerPart;
  else if (grouped.test(integerPart)) {
    digits = integerPart.split(thousands).join("");
  } else return null;
  if (digits === "" && fractionPart === "") return null;

  const roundUp = fractionPart.length > 2 && fractionPart.charCodeAt(2) >= 53;
  const magnitude =
    Number(digits || "0") * 100 +
    Number(fractionPart.slice(0, 2).padEnd(2, "0")) +
    (roundUp ? 1 : 0);
  if (!Number.isSafeInteger(magnitude) || magnitude > MAX_AMOUNT_CENTS) {
    return null;
  }
  if (magnitude === 0) return 0;
  return negative ? -magnitude : magnitude;
}

/**
 * The decimal separator used by a column of amounts. Values with both
 * separators decide on their own (the last one is the decimal point); "64,50"
 * or "64.5" vote for their separator; "1.234" (three digits after a single
 * dot) is a pt-BR thousands group and votes for the comma. Without any clue the
 * Brazilian comma wins.
 */
export function detectDecimalSeparator(
  values: readonly string[],
): DecimalSeparator {
  let comma = 0;
  let dot = 0;
  let weakComma = 0;
  let weakDot = 0;
  for (const raw of values) {
    const text = raw.replace(/[^\d.,]/g, "");
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) comma += 1;
      else dot += 1;
    } else if (lastComma !== -1) {
      if (/,\d{1,2}$/.test(text)) comma += 1;
      else if (/^\d{1,3}(,\d{3})+$/.test(text)) weakDot += 1;
    } else if (lastDot !== -1) {
      if (/\.\d{1,2}$/.test(text)) dot += 1;
      else if (/^\d{1,3}(\.\d{3})+$/.test(text)) weakComma += 1;
    }
  }
  if (comma !== dot) return comma > dot ? "," : ".";
  if (weakComma !== weakDot) return weakComma > weakDot ? "," : ".";
  return ",";
}
