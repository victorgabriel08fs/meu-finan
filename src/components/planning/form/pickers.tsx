"use client";

import { Check } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { CategoryIcon } from "@/components/finance/category-icon";
import { cn } from "@/lib/utils";

/**
 * Radio-style pickers for forms: chips (rate kinds, modes), icons and colors.
 * Each is a radiogroup with a roving tab stop; arrow keys, Home and End move
 * the selection (WAI-ARIA radio group pattern).
 */

function useRovingRadios<T extends string>(
  values: readonly T[],
  value: T | null,
  onChange: (value: T) => void,
) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = value === null ? -1 : values.indexOf(value);
  const focusIndex = selectedIndex === -1 ? 0 : selectedIndex;

  function select(index: number) {
    const next = values[index];
    if (next === undefined) return;
    onChange(next);
    refs.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = values.length - 1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        select(focusIndex === last ? 0 : focusIndex + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        select(focusIndex === 0 ? last : focusIndex - 1);
        break;
      case "Home":
        select(0);
        break;
      case "End":
        select(last);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  const bind = (index: number) => ({
    ref: (node: HTMLButtonElement | null) => {
      refs.current[index] = node;
    },
    tabIndex: index === focusIndex ? 0 : -1,
  });

  return { onKeyDown, bind, selectedIndex };
}

export type ChoiceOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Spoken label when `label` is short or symbolic ("3M"). */
  ariaLabel?: string;
  icon?: ReactNode;
};

type ChoiceChipsProps<T extends string> = {
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  labelledBy?: string;
  /** `wrap`: pills that wrap · `grid`: equal columns that fill the row. */
  layout?: "wrap" | "grid";
  className?: string;
};

/** Choice chips (doc 02 §5.12): 36–40px pills, selected in --primary-soft. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  layout = "wrap",
  className,
}: ChoiceChipsProps<T>) {
  const values = options.map((option) => option.value);
  const { onKeyDown, bind } = useRovingRadios(values, value, onChange);
  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className={cn(
        layout === "grid"
          ? "grid auto-cols-fr grid-flow-col gap-1.5"
          : "flex flex-wrap gap-2",
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: styled radio; keyboard handled by the group
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel}
            onClick={() => onChange(option.value)}
            {...bind(index)}
            className={cn(
              "relative inline-flex h-10 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-caption font-bold",
              "transition-[background-color,border-color,color,scale] duration-100 ease-standard active:scale-97 [&_svg]:size-4 [&_svg]:shrink-0",
              "after:absolute after:inset-x-0 after:-inset-y-0.5",
              // Equal columns may get narrow: let a label wrap to a second line.
              layout === "grid" &&
                "h-auto min-h-10 whitespace-normal px-2 py-1 leading-tight",
              selected
                ? "border-primary bg-primary-soft text-on-primary-soft"
                : "border-border bg-surface text-fg-2 hover:text-fg",
            )}
          >
            {option.icon}
            <span
              className={cn(
                layout === "grid" ? "text-center text-balance" : "truncate",
              )}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type IconPickerProps = {
  icons: readonly string[];
  value: string;
  onChange: (icon: string) => void;
  /** Color token used for the previews. */
  color: string;
  labelledBy: string;
  /** Spoken names of the icons ("Casa", "Avião"…). */
  names: Readonly<Record<string, string>>;
  className?: string;
};

/** Icon allow-list as a grid of 44px choices (doc 02 §5.6 icons). */
export function IconPicker({
  icons,
  value,
  onChange,
  color,
  labelledBy,
  names,
  className,
}: IconPickerProps) {
  const { onKeyDown, bind } = useRovingRadios(icons, value, onChange);
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1",
        className,
      )}
    >
      {icons.map((icon, index) => {
        const selected = icon === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: styled radio; keyboard handled by the group
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={names[icon] ?? icon}
            onClick={() => onChange(icon)}
            {...bind(index)}
            className={cn(
              "flex size-11 items-center justify-center justify-self-center rounded-full transition-[box-shadow,scale] duration-100 ease-standard active:scale-94",
              selected && "shadow-[0_0_0_2px_var(--primary)]",
            )}
          >
            <CategoryIcon
              icon={icon}
              color={selected ? color : "neutral"}
              size="md"
            />
          </button>
        );
      })}
    </div>
  );
}

/** Full class names so Tailwind finds them. */
const SWATCH: Record<string, string> = {
  "cat-1": "bg-cat-1-fg",
  "cat-2": "bg-cat-2-fg",
  "cat-3": "bg-cat-3-fg",
  "cat-4": "bg-cat-4-fg",
  "cat-5": "bg-cat-5-fg",
  "cat-6": "bg-cat-6-fg",
  "cat-7": "bg-cat-7-fg",
  "cat-8": "bg-cat-8-fg",
  neutral: "bg-cat-neutral-fg",
};

/** Spoken color names for the category palette (doc 02 §3.2). */
export const COLOR_NAMES: Readonly<Record<string, string>> = {
  "cat-1": "Azul",
  "cat-2": "Laranja",
  "cat-3": "Verde-água",
  "cat-4": "Âmbar",
  "cat-5": "Rosa",
  "cat-6": "Verde",
  "cat-7": "Violeta",
  "cat-8": "Vermelho",
  neutral: "Cinza",
};

type ColorPickerProps = {
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
  labelledBy: string;
  className?: string;
};

/** Category colors as 32px swatches in 44px targets; the selected one shows a check. */
export function ColorPicker({
  colors,
  value,
  onChange,
  labelledBy,
  className,
}: ColorPickerProps) {
  const { onKeyDown, bind } = useRovingRadios(colors, value, onChange);
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className={cn("flex flex-wrap gap-1", className)}
    >
      {colors.map((color, index) => {
        const selected = color === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: styled radio; keyboard handled by the group
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={COLOR_NAMES[color] ?? color}
            onClick={() => onChange(color)}
            {...bind(index)}
            className="flex size-11 items-center justify-center rounded-full transition-[scale] duration-100 active:scale-94"
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-white",
                SWATCH[color] ?? "bg-cat-neutral-fg",
                selected && "ring-2 ring-surface outline-2 outline-primary",
              )}
            >
              {selected ? <Check className="size-4" strokeWidth={3} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
