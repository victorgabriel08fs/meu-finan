"use client";

import { type ReactNode, useState } from "react";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatMoneyInput, parseMoneyInput } from "./inputs";

type MoneyFieldProps = {
  id: string;
  label: ReactNode;
  /** Integer cents; null while empty or invalid. */
  value: number | null;
  onValueChange: (cents: number | null) => void;
  /** Message from the form (e.g. "Informe um valor."). */
  error?: string;
  hint?: ReactNode;
  placeholder?: string;
  enterKeyHint?: "next" | "done";
  /** `md` 52px (forms) · `sm` 44px (dense control panels). */
  size?: "md" | "sm";
  /** Hides the label visually (it stays the accessible name). */
  hideLabel?: boolean;
  /** Live forms (the simulator): hold `error` back while the field has focus. */
  quietWhileTyping?: boolean;
  /** `inline`: label on the left, a compact field on the right (control panels). */
  layout?: "stacked" | "inline";
  className?: string;
};

/**
 * Money field (doc 02 §5.18, §7.3): visible label, "R$" inside the field,
 * decimal keyboard, pt-BR parsing ("1.234,56", "35" = R$ 35,00). Shows what
 * was typed while focused and the formatted amount after leaving the field.
 */
export function MoneyField({
  id,
  label,
  value,
  onValueChange,
  error,
  hint,
  placeholder = "0,00",
  enterKeyHint = "done",
  size = "md",
  hideLabel = false,
  quietWhileTyping = false,
  layout = "stacked",
  className,
}: MoneyFieldProps) {
  const inline = layout === "inline";
  // What was typed, and the value it reported. A change from outside (a
  // slider, a reset) while the field is not focused replaces a stale draft.
  const [draft, setDraft] = useState<{
    text: string;
    reported: number | null;
  } | null>(null);
  const [focused, setFocused] = useState(false);
  const showDraft = draft !== null && (focused || draft.reported === value);
  const invalid =
    showDraft &&
    draft !== null &&
    parseMoneyInput(draft.text).kind === "invalid";
  const message =
    invalid && !focused
      ? "Use só números, como 1.234,56."
      : quietWhileTyping && focused
        ? undefined
        : error;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = `${id}-error`;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className={cn(
          inline ? "flex items-center justify-between gap-3" : "contents",
        )}
      >
        <Label
          htmlFor={id}
          className={cn(hideLabel && "sr-only", inline && "text-fg-2")}
        >
          {label}
        </Label>
        <div className={cn("relative", inline && "w-40 shrink-0")}>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-callout font-semibold text-fg-2"
          >
            R$
          </span>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint={enterKeyHint}
            placeholder={placeholder}
            value={showDraft && draft ? draft.text : formatMoneyInput(value)}
            onFocus={(event) => {
              setFocused(true);
              if (!showDraft) {
                setDraft({ text: formatMoneyInput(value), reported: value });
              }
              event.currentTarget.select();
            }}
            onChange={(event) => {
              const text = event.target.value;
              const parsed = parseMoneyInput(text);
              const reported = parsed.kind === "ok" ? parsed.cents : null;
              setDraft({ text, reported });
              onValueChange(reported);
            }}
            onBlur={() => {
              setFocused(false);
              // Keep an invalid text on screen (with its error); drop a valid one.
              if (draft && parseMoneyInput(draft.text).kind !== "invalid") {
                setDraft(null);
              }
            }}
            aria-invalid={message ? true : undefined}
            aria-describedby={
              [hintId, message ? errorId : undefined]
                .filter(Boolean)
                .join(" ") || undefined
            }
            className={cn(
              "w-full min-w-0 rounded-control border border-border-strong bg-surface pr-4 pl-11 text-input text-fg tabular-nums",
              "transition-[border-color,box-shadow] duration-100 ease-standard placeholder:text-fg-3",
              "focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]",
              "aria-invalid:border-danger aria-invalid:focus-visible:shadow-[inset_0_0_0_1px_var(--danger)]",
              size === "md" ? "h-13" : "h-11",
            )}
          />
        </div>
      </div>
      {hint ? (
        <p id={hintId} className="text-caption text-fg-3">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId}>{message}</FieldError>
    </div>
  );
}
