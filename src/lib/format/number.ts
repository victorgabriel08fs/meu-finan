import { MINUS, type SignOptions, signPrefix } from "./money";

/** Percentages and rates in pt-BR (doc 02 §10.1). Inputs are ratios: 0.309 = 30,9%. */

const percentFormats = new Map<number, Intl.NumberFormat>();

function percentFormat(fractionDigits: number): Intl.NumberFormat {
  let format = percentFormats.get(fractionDigits);
  if (!format) {
    format = new Intl.NumberFormat("pt-BR", {
      style: "percent",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    percentFormats.set(fractionDigits, format);
  }
  return format;
}

const cdiPercentFormat = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function assertRatio(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(
      `${label} must be a finite number (received ${String(value)})`,
    );
  }
}

/** A value that rounds to zero ("0,00%") is shown without a sign. */
const isZeroText = (text: string) => !/[1-9]/.test(text);

/**
 * "30,9%" (one decimal), "102%" (no decimals from 100% up, decided after
 * rounding: 0.99996 → "100%"). Negatives use U+2212: "−32,0%".
 */
export function formatPercent(
  ratio: number,
  options: SignOptions = {},
): string {
  assertRatio(ratio, "ratio");
  const magnitude = Math.abs(ratio);
  let text = percentFormat(1).format(magnitude);
  const wholePercent = Number(text.split(",")[0].replace(/\D/g, ""));
  if (wholePercent >= 100) text = percentFormat(0).format(magnitude);
  const sign = isZeroText(text) ? "" : signPrefix(ratio, options.sign);
  return `${sign}${text}`;
}

/** What a rate label needs; a finance `RateInput` fits as is. */
export type RateLabelInput =
  | { kind: "monthly" | "annual"; value: number }
  /** `pct` 1.02 = 102% do CDI. */
  | { kind: "cdi"; pct: number }
  /** IPCA + `spread` (annual). */
  | { kind: "ipca"; spread: number };

/** Magnitude with a sign only when negative and not rounded to zero. */
function signedPercent(value: number, format: Intl.NumberFormat) {
  const text = format.format(Math.abs(value));
  return { negative: value < 0 && !isZeroText(text), text };
}

/** "0,95% a.m." · "12,00% a.a." · "102% do CDI" · "IPCA + 6,00%". */
export function formatRate(rate: RateLabelInput): string {
  switch (rate.kind) {
    case "monthly":
    case "annual": {
      assertRatio(rate.value, "rate.value");
      const { negative, text } = signedPercent(rate.value, percentFormat(2));
      const base = rate.kind === "monthly" ? "a.m." : "a.a.";
      return `${negative ? MINUS : ""}${text} ${base}`;
    }
    case "cdi": {
      assertRatio(rate.pct, "rate.pct");
      const { negative, text } = signedPercent(rate.pct, cdiPercentFormat);
      return `${negative ? MINUS : ""}${text} do CDI`;
    }
    case "ipca": {
      assertRatio(rate.spread, "rate.spread");
      const { negative, text } = signedPercent(rate.spread, percentFormat(2));
      return `IPCA ${negative ? MINUS : "+"} ${text}`;
    }
    default:
      throw new RangeError(
        `Unknown rate kind (received ${JSON.stringify(rate)})`,
      );
  }
}
