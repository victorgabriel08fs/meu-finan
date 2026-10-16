import { Plus } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * The "+" of the tab bar (doc 02 §4.2): 52×52, 18px radius, --primary with the
 * button shadow, `plus` at 26px. Export it so the quick-add sheet can use it as
 * its trigger: `<SheetTrigger asChild><AddFab /></SheetTrigger>`.
 */
export function AddFab({
  className,
  type,
  "aria-label": ariaLabel = "Nova transação",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type={type ?? "button"}
      aria-label={ariaLabel}
      data-slot="add-fab"
      className={cn(
        "inline-flex size-13 items-center justify-center rounded-[18px] bg-primary text-on-primary shadow-fab",
        "transition-[scale,filter] duration-100 ease-standard active:scale-94 active:brightness-94",
        className,
      )}
      {...props}
    >
      <Plus aria-hidden="true" className="size-6.5" strokeWidth={2.25} />
    </button>
  );
}
