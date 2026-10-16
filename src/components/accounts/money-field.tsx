"use client";

import { type ReactNode, useRef, useState } from "react";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MINUS } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import {
  formatMoneyText,
  moneyTextToCents,
  sanitizeMoneyTyping,
  toggleMoneySign,
} from "./money-input";

type MoneyFieldProps = {
  id: string;
  label: string;
  /** Integer cents, or null while empty. */
  value: number | null;
  onValueChange: (cents: number | null) => void;
  /** Shows a +/− toggle (iOS decimal keypads have no minus key). */
  allowNegative?: boolean;
  description?: ReactNode;
  error?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Selects the amount on focus, so typing replaces it (e.g. "saldo real"). */
  selectOnFocus?: boolean;
  enterKeyHint?: "done" | "next" | "go" | "send";
  className?: string;
};

/**
 * Amount field for forms (doc 02 §5.18): "R$" prefix, pt-BR typing ("35" is
 * R$ 35,00, the comma starts the cents), plain text while editing and the
 * grouped amount ("1.234,56") at rest. Reports integer cents.
 */
export function MoneyField({
  id,
  label,
  value,
  onValueChange,
  allowNegative = false,
  description,
  error,
  placeholder = "0,00",
  autoFocus,
  selectOnFocus = false,
  enterKeyHint = "done",
  className,
}: MoneyFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Text being edited; null at rest, when the field shows the formatted value.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatMoneyText(value);
  const negative =
    value !== null && value !== 0 ? value < 0 : (draft ?? "").startsWith(MINUS);
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  function update(text: string) {
    const clean = sanitizeMoneyTyping(text, { allowNegative });
    setDraft(clean);
    onValueChange(moneyTextToCents(clean));
  }

  function toggleSign() {
    const flipped = toggleMoneySign(
      draft ?? formatMoneyText(value, { grouping: false }),
    );
    setDraft(flipped);
    onValueChange(moneyTextToCents(flipped));
    inputRef.current?.focus();
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-callout font-semibold text-fg-3"
        >
          R$
        </span>
        <Input
          ref={inputRef}
          id={id}
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint={enterKeyHint}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={shown}
          onFocus={(event) => {
            setDraft(
              (current) =>
                current ?? formatMoneyText(value, { grouping: false }),
            );
            if (selectOnFocus) {
              // After React swaps in the ungrouped text.
              const input = event.currentTarget;
              requestAnimationFrame(() => input.select());
            }
          }}
          onBlur={() => setDraft(null)}
          onChange={(event) => update(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [descriptionId, errorId].filter(Boolean).join(" ") || undefined
          }
          className={cn("pl-11 tabular-nums", allowNegative && "pr-20")}
        />
        {allowNegative ? (
          <button
            type="button"
            aria-label="Valor negativo"
            aria-pressed={negative}
            // Keeps the caret in the field when tapped while typing.
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggleSign}
            className={cn(
              "absolute inset-y-1 right-1 inline-flex min-w-16 items-center justify-center rounded-chip px-3 text-callout font-bold tabular-nums transition-colors duration-100",
              negative
                ? "bg-danger-soft text-danger"
                : "bg-surface-2 text-fg-2 hover:bg-surface-3",
            )}
          >
            <span aria-hidden="true">+/{MINUS}</span>
          </button>
        ) : null}
      </div>
      {description ? (
        <p id={descriptionId} className="text-caption text-fg-3">
          {description}
        </p>
      ) : null}
      {errorId ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
