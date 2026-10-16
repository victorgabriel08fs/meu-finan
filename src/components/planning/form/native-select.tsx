import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Native <select> styled as a form field (doc 02 §5.18): the platform picker
 * is the most accessible list on phones. Pair it with a visible <Label>.
 */
export function NativeSelect({
  className,
  children,
  ...props
}: ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        className={cn(
          "h-13 w-full min-w-0 appearance-none rounded-control border border-border-strong bg-surface pr-11 pl-4 text-input text-fg",
          "transition-[border-color,box-shadow] duration-100 ease-standard",
          "focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]",
          "aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-60",
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-fg-3"
      />
    </div>
  );
}
