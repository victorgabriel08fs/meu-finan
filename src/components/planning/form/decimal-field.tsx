"use client";

import { Minus, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { FieldError } from "@/components/ui/field-error";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDecimalInput, parseDecimalInput, stepDecimal } from "./inputs";

type DecimalFieldProps = {
  id: string;
  label: ReactNode;
  value: number | null;
  onValueChange: (value: number | null) => void;
  /** Unit after the number: "% a.a.", "% do CDI". */
  suffix?: string;
  /** Text before the number: "IPCA +". */
  prefix?: string;
  /** Shows − / + buttons that move the value by this step (e.g. 0,25). */
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
  allowNegative?: boolean;
  error?: string;
  hint?: ReactNode;
  size?: "md" | "sm";
  hideLabel?: boolean;
  /** Live forms (the simulator): hold `error` back while the field has focus. */
  quietWhileTyping?: boolean;
  className?: string;
};

/**
 * Number field for rates and percentages in pt-BR ("12,5"), with an optional
 * ±step stepper (doc 02 §6.11: "Campo com stepper ±0,25").
 */
export function DecimalField({
  id,
  label,
  value,
  onValueChange,
  suffix,
  prefix,
  step,
  min,
  max,
  digits = 2,
  allowNegative = false,
  error,
  hint,
  size = "md",
  hideLabel = false,
  quietWhileTyping = false,
  className,
}: DecimalFieldProps) {
  // Same draft rules as MoneyField: an outside change replaces a stale draft.
  const [draft, setDraft] = useState<{
    text: string;
    reported: number | null;
  } | null>(null);
  const [focused, setFocused] = useState(false);
  const showDraft = draft !== null && (focused || draft.reported === value);
  const invalid =
    showDraft &&
    draft !== null &&
    parseDecimalInput(draft.text, { allowNegative }).kind === "invalid";
  const message =
    invalid && !focused
      ? "Use um número, como 12,5."
      : quietWhileTyping && focused
        ? undefined
        : error;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = `${id}-error`;
  const bounds = { min, max };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
      </Label>
      <div className="flex items-center gap-1">
        {step ? (
          <IconButton
            label={`Diminuir ${formatDecimalInput(step, digits)}`}
            onClick={() => {
              setDraft(null);
              onValueChange(stepDecimal(value, -step, bounds));
            }}
            disabled={min !== undefined && value !== null && value <= min}
            className="bg-surface-2"
          >
            <Minus />
          </IconButton>
        ) : null}
        <div className="relative min-w-0 flex-1">
          {prefix ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-callout font-semibold text-fg-2"
            >
              {prefix}
            </span>
          ) : null}
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            value={
              showDraft && draft
                ? draft.text
                : formatDecimalInput(value, digits)
            }
            onFocus={(event) => {
              setFocused(true);
              if (!showDraft) {
                setDraft({
                  text: formatDecimalInput(value, digits),
                  reported: value,
                });
              }
              event.currentTarget.select();
            }}
            onChange={(event) => {
              const text = event.target.value;
              const parsed = parseDecimalInput(text, { allowNegative });
              const reported = parsed.kind === "ok" ? parsed.value : null;
              setDraft({ text, reported });
              onValueChange(reported);
            }}
            onBlur={() => {
              setFocused(false);
              if (
                draft &&
                parseDecimalInput(draft.text, { allowNegative }).kind !==
                  "invalid"
              ) {
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
              "w-full min-w-0 rounded-control border border-border-strong bg-surface text-input text-fg tabular-nums",
              "transition-[border-color,box-shadow] duration-100 ease-standard placeholder:text-fg-3",
              "focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]",
              "aria-invalid:border-danger aria-invalid:focus-visible:shadow-[inset_0_0_0_1px_var(--danger)]",
              size === "md" ? "h-13" : "h-11",
              prefix ? "pl-17" : "pl-4",
              suffix ? "pr-20" : "pr-4",
            )}
          />
          {suffix ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-callout font-semibold text-fg-2"
            >
              {suffix}
            </span>
          ) : null}
        </div>
        {step ? (
          <IconButton
            label={`Aumentar ${formatDecimalInput(step, digits)}`}
            onClick={() => {
              setDraft(null);
              onValueChange(stepDecimal(value, step, bounds));
            }}
            disabled={max !== undefined && value !== null && value >= max}
            className="bg-surface-2"
          >
            <Plus />
          </IconButton>
        ) : null}
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
