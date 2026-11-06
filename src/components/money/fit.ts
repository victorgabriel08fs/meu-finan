import type { BRLParts } from "@/lib/format/money";

/**
 * How wide an amount is, in em of its own font size (doc 02 §5.4). The
 * widths are those of the app's font with some margin — an estimate, since
 * CSS has no way to measure text — so the amount shrinks to fit its card
 * without a script, and never ends up wider than the card.
 */
const DIGIT = 0.6;
const SEPARATOR = 0.3;
const SIGN = 0.6;
const SPACE = 0.25;
const CURRENCY = 1.3;
/** Split variants draw "R$" at 0.5em and the cents at 0.55em. */
const CURRENCY_SCALE = 0.5;
const CURRENCY_GAP = 0.2;
const CENTS_SCALE = 0.55;
const MARGIN = 1.05;

function textEm(text: string): number {
  let width = 0;
  for (const char of text) {
    if (char >= "0" && char <= "9") width += DIGIT;
    else if (char === "." || char === ",") width += SEPARATOR;
    else if (char === "+" || char === "−" || char === "-") width += SIGN;
    else width += SPACE;
  }
  return width;
}

/** Width of the amount in em of the font size the amount is drawn at. */
export function moneyWidthEm(parts: BRLParts, split: boolean): number {
  const sign = textEm(parts.sign);
  const integer = textEm(parts.integer);
  const decimal = textEm(parts.decimal);
  const width = split
    ? sign +
      (CURRENCY + CURRENCY_GAP) * CURRENCY_SCALE +
      integer +
      decimal * CENTS_SCALE
    : sign + CURRENCY + SPACE + integer + decimal;
  return width * MARGIN;
}
