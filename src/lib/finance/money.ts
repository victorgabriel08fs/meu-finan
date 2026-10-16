import { show } from "./guards";

/**
 * Persisted money is an integer number of cents (doc 03 §1). Projections use
 * reais as plain numbers and round only for display.
 */

export function isCents(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

/** Throws RangeError unless `value` is a safe integer (cents). */
export function assertCents(
  value: unknown,
  label = "amount",
): asserts value is number {
  if (!isCents(value)) {
    throw new RangeError(
      `${label} must be an integer number of cents (received ${show(value)})`,
    );
  }
}

/**
 * Exact sum of cents. Throws RangeError for non-integers or when a running
 * total leaves the safe range (past it, additions are no longer exact).
 */
export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    assertCents(value);
    total += value;
    assertCents(total, "sum");
  }
  return total;
}

export function centsToReais(cents: number): number {
  assertCents(cents);
  return cents / 100;
}

/**
 * Rounds reais to whole cents, half away from zero, using the shortest decimal
 * form of the number (so 1.005 → 101, not the 100 that `Math.round(1.005 * 100)`
 * gives). Throws RangeError for non-finite values or results beyond safe integers.
 */
export function reaisToCents(reais: number): number {
  const cents = numberToCents(reais);
  if (cents === null) {
    throw new RangeError(
      `reais must be a finite amount within the safe range (received ${show(reais)})`,
    );
  }
  return cents;
}

/**
 * Parses an amount typed or exported in pt-BR into cents, or returns null when
 * the input is not an amount. Accepted strings: optional sign (`-`, `+` or the
 * U+2212 minus, before or after the symbol), optional `R$`, any whitespace, the
 * integer part with or without `.` thousands groups and an optional `,` decimal
 * part: "1.234,56", "-R$ 64,50", "R$ −64,50", "1234", ",5". Without a comma, a
 * single `.` followed by 1–2 digits is read as the decimal point ("12.5"); with
 * three digits it is a thousands group ("1.234" = 1234 reais). Extra decimal
 * places are rounded half away from zero. Numbers are taken as reais.
 */
export function parseBRLToCents(input: string | number): number | null {
  if (typeof input === "number") return numberToCents(input);
  if (typeof input !== "string") return null;

  const compact = input.replace(/\s+/g, "");
  const match = /^([-+−]?)(?:R\$)?([-+−]?)([\d.]*)(?:,(\d*))?$/.exec(compact);
  if (!match) return null;
  const [, signBefore, signAfter, integerText, fractionText] = match;
  if (signBefore && signAfter) return null;
  const sign = signBefore || signAfter;

  let integer: string;
  let fraction: string;
  if (fractionText !== undefined) {
    if (!/^(?:\d{1,3}(?:\.\d{3})+|\d*)$/.test(integerText)) return null;
    integer = integerText;
    fraction = fractionText;
  } else if (/^(?:\d{1,3}(?:\.\d{3})+|\d+)$/.test(integerText)) {
    integer = integerText;
    fraction = "";
  } else {
    const decimalPoint = /^(\d+)\.(\d{1,2})$/.exec(integerText);
    if (!decimalPoint) return null;
    integer = decimalPoint[1];
    fraction = decimalPoint[2];
  }
  if (integer === "" && fraction === "") return null;
  return digitsToCents(
    sign === "+" ? "" : sign,
    integer.replaceAll(".", ""),
    fraction,
  );
}

function numberToCents(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const text = String(Math.abs(value));
  // String() switches to exponent notation below 1e-6 (rounds to 0 cents)
  // and from 1e21 (far beyond the safe range of cents).
  if (text.includes("e")) return Math.abs(value) < 1 ? 0 : null;
  const [integer, fraction = ""] = text.split(".");
  return digitsToCents(value < 0 ? "-" : "", integer, fraction);
}

function digitsToCents(
  sign: string,
  integer: string,
  fraction: string,
): number | null {
  const roundUp = fraction.length > 2 && fraction.charCodeAt(2) >= 53; // "5"
  const magnitude =
    Number(integer || "0") * 100 +
    Number(fraction.slice(0, 2).padEnd(2, "0")) +
    (roundUp ? 1 : 0);
  if (!Number.isSafeInteger(magnitude)) return null;
  return sign !== "" && magnitude !== 0 ? -magnitude : magnitude;
}
