import { assertCents } from "@/lib/finance/money";

/**
 * Money display in pt-BR (doc 02 §10.1). Amounts are integer cents; the output
 * keeps the no-break space (U+00A0) that Intl puts between "R$" and the number
 * (so the symbol never wraps alone) and uses the typographic minus U+2212.
 */

/** `auto`: sign on negatives only · `always`: also "+" on positives · `never`: absolute value. */
export type SignDisplay = "auto" | "always" | "never";

export type SignOptions = { sign?: SignDisplay };

/** No-break space (U+00A0) between "R$" and the number, as emitted by Intl. */
export const NBSP = " ";

/** Typographic minus (U+2212) for negative amounts: "−R$ 64,50". */
export const MINUS = "−";

export type BRLParts = {
  sign: "" | "+" | typeof MINUS;
  /** "R$". */
  currency: string;
  /** Whole reais with thousands groups: "1.234". */
  integer: string;
  /** Decimal comma and cents: ",56". */
  decimal: string;
};

const currencyFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

// Compact notation ("R$ 105,8 mil", "R$ 1,2 mi"): one decimal from a thousand
// up, whole reais below it (cents are noise on axes and narrow tiles).
const compactFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const compactSmallFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 0,
});

const SIGN_DISPLAYS: readonly SignDisplay[] = ["auto", "always", "never"];

/** Sign prefix for a value; zero never gets one. Shared by the number formatters. */
export function signPrefix(
  value: number,
  sign: SignDisplay = "auto",
): BRLParts["sign"] {
  if (!SIGN_DISPLAYS.includes(sign)) {
    throw new RangeError(
      `sign must be one of ${SIGN_DISPLAYS.join(", ")} (received ${String(sign)})`,
    );
  }
  if (sign === "never" || value === 0) return "";
  if (value < 0) return MINUS;
  return sign === "always" ? "+" : "";
}

/**
 * The pieces of a formatted amount, for components that style them apart
 * (smaller "R$" and cents in the display variant). Exact for every safe
 * integer: reais and cents are split with integer arithmetic before Intl.
 */
export function brlParts(cents: number, options: SignOptions = {}): BRLParts {
  assertCents(cents, "cents");
  const magnitude = Math.abs(cents);
  const remainder = magnitude % 100;
  const reais = (magnitude - remainder) / 100;
  let currency = "";
  let integer = "";
  let decimalSeparator = ",";
  for (const part of currencyFormat.formatToParts(reais)) {
    if (part.type === "currency") currency = part.value;
    else if (part.type === "integer" || part.type === "group") {
      integer += part.value;
    } else if (part.type === "decimal") decimalSeparator = part.value;
  }
  return {
    sign: signPrefix(cents, options.sign),
    currency,
    integer,
    decimal: `${decimalSeparator}${String(remainder).padStart(2, "0")}`,
  };
}

/** "R$ 1.234,56", "−R$ 64,50", "+R$ 7.800,00" (with `sign: 'always'`). */
export function formatBRL(cents: number, options: SignOptions = {}): string {
  const { sign, currency, integer, decimal } = brlParts(cents, options);
  return `${sign}${currency}${NBSP}${integer}${decimal}`;
}

/** "R$ 105,8 mil", "R$ 1,2 mi", "R$ 950": for chart axes and narrow tiles. */
export function formatCompactBRL(
  cents: number,
  options: SignOptions = {},
): string {
  assertCents(cents, "cents");
  const reais = Math.abs(cents) / 100;
  const format = reais >= 1000 ? compactFormat : compactSmallFormat;
  const text = format.format(reais).replace(/\s/g, NBSP);
  // An amount that rounds to "R$ 0" shows no sign.
  const sign = /[1-9]/.test(text) ? signPrefix(cents, options.sign) : "";
  return `${sign}${text}`;
}
