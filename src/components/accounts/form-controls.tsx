"use client";

import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import {
  CATEGORY_ICONS,
  isCategoryIconName,
} from "@/components/finance/category-icon";
import { FieldError } from "@/components/ui/field-error";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_COLOR_OPTIONS,
  ACCOUNT_TYPE_OPTIONS,
  type AccountColor,
  type AccountType,
  cardCycleSummary,
  MONTH_DAYS,
} from "./account-meta";

/**
 * Form building blocks of the account screens (doc 02 §5.12, §5.18). Choices
 * are native radio inputs styled as chips/swatches, so arrow keys, focus and
 * screen readers work without extra code.
 */

const focusRing =
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus";

type TypePickerProps = {
  name: string;
  value: AccountType;
  onChange: (type: AccountType) => void;
  legend?: string;
};

/** Account type as choice chips with the type icon (§3.9). */
export function TypePicker({
  name,
  value,
  onChange,
  legend = "Tipo",
}: TypePickerProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-callout font-semibold text-fg">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {ACCOUNT_TYPE_OPTIONS.map((option) => {
          const Icon = isCategoryIconName(option.icon)
            ? CATEGORY_ICONS[option.icon]
            : null;
          return (
            <label key={option.value} className="relative">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex h-11 cursor-pointer select-none items-center gap-2 rounded-full border border-border-strong/40 bg-surface pr-4 pl-3 text-callout font-semibold text-fg-2",
                  "transition-[background-color,color,box-shadow] duration-150 ease-standard hover:bg-surface-2 active:scale-97",
                  "peer-checked:border-transparent peer-checked:bg-primary-soft peer-checked:text-on-primary-soft peer-checked:ring-2 peer-checked:ring-primary",
                  focusRing,
                )}
              >
                {Icon ? (
                  <Icon aria-hidden="true" className="size-4.5 shrink-0" />
                ) : null}
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// Full class names so Tailwind finds them.
const SWATCH: Record<AccountColor, string> = {
  "cat-1": "bg-cat-1-fg",
  "cat-2": "bg-cat-2-fg",
  "cat-3": "bg-cat-3-fg",
  "cat-4": "bg-cat-4-fg",
  "cat-5": "bg-cat-5-fg",
  "cat-6": "bg-cat-6-fg",
  "cat-7": "bg-cat-7-fg",
  "cat-8": "bg-cat-8-fg",
};

type ColorPickerProps = {
  name: string;
  value: AccountColor;
  onChange: (color: AccountColor) => void;
  legend?: string;
  /** Shown next to the legend, e.g. a preview of the account icon. */
  preview?: ReactNode;
};

/** The eight category hues as 44px swatches; the chosen one gets a check. */
export function ColorPicker({
  name,
  value,
  onChange,
  legend = "Cor",
  preview,
}: ColorPickerProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 flex items-center gap-2 text-callout font-semibold text-fg">
        {legend}
        {preview}
      </legend>
      <div className="-mx-0.5 flex flex-wrap gap-1">
        {ACCOUNT_COLOR_OPTIONS.map((option) => (
          <label key={option.value} className="relative">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="sr-only">{option.label}</span>
            <span
              aria-hidden="true"
              className={cn(
                "flex size-11 cursor-pointer items-center justify-center rounded-full",
                "[&>span]:transition-[box-shadow,scale] [&>span]:duration-150 active:[&>span]:scale-94",
                "peer-checked:[&>span]:ring-2 peer-checked:[&>span]:ring-primary peer-checked:[&>span]:ring-offset-2 peer-checked:[&>span]:ring-offset-surface",
                "peer-checked:[&_svg]:opacity-100",
                focusRing,
              )}
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-white",
                  SWATCH[option.value],
                )}
              >
                <Check className="size-4.5 opacity-0" strokeWidth={3} />
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type DaySelectProps = {
  id: string;
  label: string;
  value: number | null;
  onChange: (day: number | null) => void;
  error?: string;
  className?: string;
};

/** Day of the month (1–31) on a native select: the phone's own wheel/list. */
export function DaySelect({
  id,
  label,
  value,
  onChange,
  error,
  className,
}: DaySelectProps) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <select
          id={id}
          value={value ?? ""}
          onChange={(event) =>
            onChange(event.target.value ? Number(event.target.value) : null)
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={cn(
            "h-13 w-full min-w-0 appearance-none rounded-control border border-border-strong bg-surface pr-10 pl-4 text-input text-fg tabular-nums",
            "transition-[border-color,box-shadow] duration-100 ease-standard",
            "focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]",
            "aria-invalid:border-danger aria-invalid:focus-visible:shadow-[inset_0_0_0_1px_var(--danger)]",
            value === null && "text-fg-3",
          )}
        >
          <option value="">Escolha</option>
          {MONTH_DAYS.map((day) => (
            <option key={day} value={day}>
              Dia {day}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-fg-3"
        />
      </div>
      {errorId ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

type CardCycleFieldsProps = {
  idPrefix: string;
  closingDay: number | null;
  dueDay: number | null;
  onClosingDayChange: (day: number | null) => void;
  onDueDayChange: (day: number | null) => void;
  errors?: { closingDay?: string; dueDay?: string };
};

/** Closing and due days side by side, with the resulting cycle spelled out. */
export function CardCycleFields({
  idPrefix,
  closingDay,
  dueDay,
  onClosingDayChange,
  onDueDayChange,
  errors = {},
}: CardCycleFieldsProps) {
  const showSummary =
    closingDay !== null &&
    dueDay !== null &&
    !errors.closingDay &&
    !errors.dueDay;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <DaySelect
          id={`${idPrefix}-closing`}
          label="Fechamento"
          value={closingDay}
          onChange={onClosingDayChange}
          error={errors.closingDay}
        />
        <DaySelect
          id={`${idPrefix}-due`}
          label="Vencimento"
          value={dueDay}
          onChange={onDueDayChange}
          error={errors.dueDay}
        />
      </div>
      {showSummary ? (
        <p className="text-caption text-fg-3">
          {cardCycleSummary(closingDay, dueDay)} Compras a partir do dia{" "}
          {closingDay} entram na fatura seguinte.
        </p>
      ) : null}
    </div>
  );
}

type CheckboxRowProps = {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
};

/** A 44px checkbox row with a label and a support line. */
export function CheckboxRow({
  id,
  checked,
  onChange,
  label,
  description,
}: CheckboxRowProps) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-start gap-3 py-1"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-primary"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-body font-semibold text-fg">{label}</span>
        {description ? (
          <span className="text-caption text-fg-3">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
