import { parseBRLToCents } from "@/lib/finance/money";
import { brlParts } from "@/lib/format/money";

/**
 * Parsing and formatting of what is typed in money and percentage fields
 * (pt-BR: "1.234,56", "12,5"). Pure, so forms and tests share it.
 */

/** Largest amount the Server Actions accept (R$ 999.999.999,99). */
export const MAX_INPUT_CENTS = 99_999_999_999;

export type MoneyInputResult =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "ok"; cents: number };

/**
 * "1.234,56", "R$ 64,50", "35" (= R$ 35,00), "12.5" → cents. Negative and
 * oversized amounts are invalid: money fields hold magnitudes.
 */
export function parseMoneyInput(text: string): MoneyInputResult {
  if (text.trim() === "") return { kind: "empty" };
  const cents = parseBRLToCents(text);
  if (cents === null || cents < 0 || cents > MAX_INPUT_CENTS) {
    return { kind: "invalid" };
  }
  return { kind: "ok", cents };
}

/** Editable text for an amount: "1.234,56", "1.234" without cents, "" for null. */
export function formatMoneyInput(cents: number | null): string {
  if (cents === null || !Number.isSafeInteger(cents)) return "";
  const { integer, decimal } = brlParts(Math.abs(cents));
  return decimal === ",00" ? integer : `${integer}${decimal}`;
}

export type DecimalInputResult =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "ok"; value: number };

/** "12,5", "12.5", "−1,25", "0,95" → number (no thousands separators). */
export function parseDecimalInput(
  text: string,
  { allowNegative = false }: { allowNegative?: boolean } = {},
): DecimalInputResult {
  const compact = text.replace(/\s+/g, "").replace("−", "-");
  if (compact === "") return { kind: "empty" };
  const match = /^(-?)(\d*)(?:[.,](\d*))?$/.exec(compact);
  if (!match) return { kind: "invalid" };
  const [, sign, integer = "", fraction = ""] = match;
  if (integer === "" && fraction === "") return { kind: "invalid" };
  if (sign && !allowNegative) return { kind: "invalid" };
  const value = Number(`${sign}${integer || "0"}.${fraction || "0"}`);
  return Number.isFinite(value) ? { kind: "ok", value } : { kind: "invalid" };
}

const decimalFormats = new Map<number, Intl.NumberFormat>();

/** "12,5", "0,95", "100" — up to `digits` decimals, no grouping. */
export function formatDecimalInput(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "";
  let format = decimalFormats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: digits,
      useGrouping: false,
    });
    decimalFormats.set(digits, format);
  }
  return format.format(value).replace("-", "−");
}

/** value ± step, rounded to 4 decimals (no 12.249999…) and clamped. */
export function stepDecimal(
  value: number | null,
  step: number,
  { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {},
): number {
  const next = Math.round(((value ?? 0) + step) * 10_000) / 10_000;
  return Math.min(max, Math.max(min, next));
}
