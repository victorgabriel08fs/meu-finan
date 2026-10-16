import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ChipLook = {
  selected?: boolean;
  /** Has a leading icon; `iconCircle` when it is a 28px circle. */
  icon?: boolean;
  iconCircle?: boolean;
};

/** Classes of a choice chip, for elements that cannot be a <button>. */
export function choiceChipClass({
  selected = false,
  icon = false,
  iconCircle = false,
}: ChipLook): string {
  return cn(
    "relative inline-flex h-10 max-w-full shrink-0 items-center gap-2 rounded-full border text-callout font-semibold",
    "transition-[background-color,border-color,box-shadow,scale] duration-100 ease-standard active:scale-97",
    "disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0",
    icon ? (iconCircle ? "pr-3.5 pl-1.5" : "pr-3.5 pl-3") : "px-3.5",
    selected
      ? "border-primary bg-primary-soft text-on-primary-soft shadow-[inset_0_0_0_1px_var(--primary)]"
      : "border-border bg-surface text-fg hover:bg-surface-2",
  );
}

type ChoiceChipProps = ComponentProps<"button"> & {
  /** Selected look: --primary-soft fill with a 2px --primary ring. */
  selected?: boolean;
  /** Leading 28px icon (a small CategoryIcon) or a 16px glyph. */
  icon?: ReactNode;
  /** `icon` is a 28px circle: tighter left padding. */
  iconCircle?: boolean;
};

/**
 * "Escolha" chip (doc 02 §5.12): 40px pill with an optional icon, used for
 * categories, accounts, dates and the paid switch of the quick-add sheet.
 * Pass `aria-pressed`, `role="switch"` or `aria-haspopup` as fits the use.
 */
export function ChoiceChip({
  selected = false,
  icon,
  iconCircle = false,
  className,
  type,
  children,
  ...props
}: ChoiceChipProps) {
  return (
    <button
      type={type ?? "button"}
      data-selected={selected ? "" : undefined}
      className={cn(
        choiceChipClass({ selected, icon: Boolean(icon), iconCircle }),
        className,
      )}
      {...props}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}
