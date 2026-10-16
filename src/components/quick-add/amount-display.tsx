"use client";

import { motion, useAnimate, useReducedMotion } from "motion/react";
import { type KeyboardEvent, type Ref, useEffect } from "react";
import { formatBRL } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import type { EntryKind } from "@/stores/quick-add";
import {
  displayValue,
  evaluate,
  expressionLine,
  hasOperator,
} from "./calculator";

const KIND_TONE: Record<EntryKind, string> = {
  expense: "text-fg",
  income: "text-income",
  transfer: "text-transfer",
};

type AmountDisplayProps = {
  expression: string;
  kind: EntryKind;
  /** Error under the amount (--danger), or the reason the save is disabled. */
  message: string | null;
  messageTone: "error" | "hint";
  /** Increment to shake the amount (invalid result, §5.5). */
  shakeSignal: number;
  /** The keypad is the active input: show the blinking caret. */
  active: boolean;
  onActivate: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  ref?: Ref<HTMLDivElement>;
  messageId: string;
};

/**
 * Amount of the quick-add sheet (doc 02 §5.5): 48px figure with a smaller
 * "R$", a 2px blinking caret, the expression line above it when there is an
 * operation and the error line below. A focusable textbox: on desktop it
 * takes the physical keyboard; screen readers hear the formatted value.
 */
export function AmountDisplay({
  expression,
  kind,
  message,
  messageTone,
  shakeSignal,
  active,
  onActivate,
  onKeyDown,
  ref,
  messageId,
}: AmountDisplayProps) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (shakeSignal === 0 || reduceMotion || !scope.current) return;
    void animate(
      scope.current,
      { x: [0, -6, 6, -6, 6, -6, 0] },
      { duration: 0.24, ease: "easeInOut" },
    );
  }, [shakeSignal, reduceMotion, animate, scope]);

  const empty = expression === "";
  const value = displayValue(expression);
  const line = expressionLine(expression);
  const cents = evaluate(expression) ?? 0;
  const spoken = empty
    ? "zero"
    : hasOperator(expression)
      ? `${line.replaceAll("+", "mais").replaceAll("−", "menos")}, total ${formatBRL(cents)}`
      : formatBRL(cents);
  const size =
    value.length > 13
      ? "text-[1.75rem] leading-9"
      : value.length > 10
        ? "text-[2.25rem] leading-11"
        : "text-amount";

  return (
    <div className="flex flex-col items-center">
      <p
        aria-hidden="true"
        className="h-5 max-w-full truncate text-callout font-semibold text-fg-3 tabular-nums"
      >
        {line}
      </p>
      <div ref={scope} className="flex max-w-full justify-center">
        {/* biome-ignore lint/a11y/useSemanticElements: a calculator display, not a native field — the keypad and keyboard handler edit it */}
        <div
          ref={ref}
          role="textbox"
          tabIndex={0}
          aria-label="Valor"
          aria-describedby={message ? messageId : undefined}
          aria-invalid={messageTone === "error" && message ? true : undefined}
          onClick={onActivate}
          onFocus={onActivate}
          onKeyDown={onKeyDown}
          className={cn(
            "flex min-h-14 max-w-full cursor-text items-center justify-center rounded-control px-3 outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus",
            empty ? "text-fg-3" : KIND_TONE[kind],
          )}
        >
          <span aria-hidden="true" className="flex items-baseline">
            <span className="mr-2 text-title-2 font-semibold text-fg-2">
              R$
            </span>
            <span
              className={cn("font-bold tracking-[-0.03em] tabular-nums", size)}
            >
              {value}
            </span>
          </span>
          <Caret visible={active} />
          <span className="sr-only" aria-live="polite">
            {spoken}
          </span>
        </div>
      </div>
      <p
        id={messageId}
        className={cn(
          "h-4.5 text-caption font-semibold",
          messageTone === "error" ? "text-danger" : "text-fg-3",
        )}
      >
        {message}
      </p>
    </div>
  );
}

function Caret({ visible }: { visible: boolean }) {
  const reduceMotion = useReducedMotion();
  if (!visible) return <span aria-hidden="true" className="ml-1 w-0.5" />;
  return (
    <motion.span
      aria-hidden="true"
      className="ml-1 h-10 w-0.5 rounded-full bg-primary"
      animate={reduceMotion ? undefined : { opacity: [1, 1, 0, 0] }}
      transition={{
        duration: 1,
        repeat: Number.POSITIVE_INFINITY,
        times: [0, 0.5, 0.5, 1],
        ease: "linear",
      }}
    />
  );
}
