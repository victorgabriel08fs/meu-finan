import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<ComponentProps<"button">, "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/** On/off switch: 52×32 track (44px touch target), thumb slides right when on. */
export function Switch({
  checked,
  onCheckedChange,
  className,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-8 w-13 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 ease-standard",
        "after:absolute after:-inset-1.5 disabled:pointer-events-none disabled:opacity-40",
        checked ? "bg-primary" : "bg-surface-3",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-7 rounded-full bg-surface shadow-thumb transition-transform duration-150 ease-standard",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}
