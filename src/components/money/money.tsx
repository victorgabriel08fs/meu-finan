import { type BRLParts, brlParts, MINUS, NBSP } from "@/lib/format/money";
import { cn } from "@/lib/utils";

export type MoneyVariant =
  | "display"
  | "title"
  | "headline"
  | "callout"
  | "caption";
export type MoneySign = "auto" | "always" | "never";
export type MoneyTone = "auto" | "neutral" | "income" | "transfer";

type MoneyProps = {
  /** Integer cents, signed (inflow > 0, outflow < 0). */
  cents: number;
  /** display 40px · title 22px (R$ and cents smaller) · headline/callout/caption (list sizes, tabular). */
  variant?: MoneyVariant;
  /**
   * auto: "−" on negatives, "+" on positives shown as income · always: "+"/"−"
   * · never: absolute value.
   */
  sign?: MoneySign;
  /**
   * auto: positives in --income with "+", negatives in --text with "−" ·
   * neutral: --text · income: --income · transfer: --text-2, no sign.
   */
  tone?: MoneyTone;
  className?: string;
};

const SIZE: Record<MoneyVariant, string> = {
  display: "text-display",
  title: "text-title-2",
  headline: "text-headline",
  callout: "text-callout",
  caption: "text-caption",
};

const TONE: Record<Exclude<MoneyTone, "auto">, string> = {
  neutral: "text-fg",
  income: "text-income",
  transfer: "text-fg-2",
};

/**
 * Money (doc 02 §3.4, §5.4). Display and title variants shrink the "R$"
 * (0.5em, 600) and the cents (0.55em) in --text-2 and keep proportional
 * figures; list variants are one size with tabular figures. Screen readers
 * hear "menos 64 reais e 50 centavos". In privacy mode (<html
 * data-privacy="on">) CSS swaps the value for "R$ ••••" — no hooks, so it
 * renders in Server and Client Components alike.
 */
export function Money({
  cents,
  variant = "headline",
  sign = "auto",
  tone = "auto",
  className,
}: MoneyProps) {
  const resolvedTone =
    tone === "auto" ? (cents > 0 ? "income" : "neutral") : tone;
  const signDisplay =
    sign !== "auto"
      ? sign
      : resolvedTone === "income"
        ? "always"
        : resolvedTone === "transfer"
          ? "never"
          : "auto";
  const parts = brlParts(cents, { sign: signDisplay });
  const split = variant === "display" || variant === "title";
  const partTone = resolvedTone === "neutral" ? "text-fg-2" : undefined;

  return (
    <span
      data-slot="money"
      className={cn(
        "whitespace-nowrap",
        SIZE[variant],
        !split && "tabular-nums",
        TONE[resolvedTone],
        className,
      )}
    >
      <span data-privacy-value="">
        <span aria-hidden="true">
          {split ? (
            <>
              {parts.sign}
              <span
                className={cn(
                  "mr-[0.2em] text-[0.5em] font-semibold",
                  partTone,
                )}
              >
                {parts.currency}
              </span>
              {parts.integer}
              <span className={cn("text-[0.55em]", partTone)}>
                {parts.decimal}
              </span>
            </>
          ) : (
            `${parts.sign}${parts.currency}${NBSP}${parts.integer}${parts.decimal}`
          )}
        </span>
        <span className="sr-only">{spokenAmount(cents, parts)}</span>
      </span>
      <span data-privacy-mask="" role="img" aria-label="valor oculto">
        <span aria-hidden="true">
          {split ? (
            <>
              <span
                className={cn(
                  "mr-[0.2em] text-[0.5em] font-semibold",
                  partTone,
                )}
              >
                {parts.currency}
              </span>
              ••••
            </>
          ) : (
            `${parts.currency}${NBSP}••••`
          )}
        </span>
      </span>
    </span>
  );
}

/** "menos 1.234 reais e 56 centavos", "mais 7.800 reais", "50 centavos". */
export function spokenAmount(cents: number, parts: BRLParts): string {
  const magnitude = Math.abs(cents);
  const centavos = magnitude % 100;
  const reais = (magnitude - centavos) / 100;
  const reaisText = `${parts.integer} ${reais === 1 ? "real" : "reais"}`;
  const centavosText = `${centavos} ${centavos === 1 ? "centavo" : "centavos"}`;
  let body: string;
  if (centavos === 0) body = reaisText;
  else if (reais === 0) body = centavosText;
  else body = `${reaisText} e ${centavosText}`;
  if (parts.sign === MINUS) return `menos ${body}`;
  if (parts.sign === "+") return `mais ${body}`;
  return body;
}
