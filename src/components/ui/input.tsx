import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Text field (doc 02 §5.18): 52px tall, 16px text (smaller makes iOS Safari
 * zoom), 1px --border-strong outline. Focus thickens the border to 2px in
 * --primary plus the focus ring; `aria-invalid` turns both red. Pair it with a
 * visible <Label> and point `aria-describedby` at its <FieldError>.
 */
export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      type={type ?? "text"}
      className={cn(
        "h-13 w-full min-w-0 rounded-control border border-border-strong bg-surface px-4 text-input text-fg",
        "transition-[border-color,box-shadow] duration-100 ease-standard placeholder:text-fg-3",
        "focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]",
        "aria-invalid:border-danger aria-invalid:outline-danger aria-invalid:focus-visible:shadow-[inset_0_0_0_1px_var(--danger)]",
        "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60",
        "read-only:bg-surface-2 file:mr-3 file:border-0 file:bg-transparent file:font-semibold file:text-callout file:text-fg",
        className,
      )}
      {...props}
    />
  );
}
