import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<
  ComponentProps<"button">,
  "onChange" | "aria-checked" | "role" | "type"
> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Id of the visible label (preferred) … */
  labelledBy?: string;
  /** … or an accessible name when there is none. */
  label?: string;
  describedBy?: string;
};

/**
 * On/off switch (doc 02 §5.17): the track is --switch-w × --switch-h (51 × 31
 * at 100%, capped as the text grows), off in --switch-off (3:1 against the
 * surface in both themes), on in --primary; the button is at least 44px tall
 * and wide, role="switch".
 */
export function Switch({
  checked,
  onCheckedChange,
  labelledBy,
  label,
  describedBy,
  className,
  ...rest
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      aria-describedby={describedBy}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex min-h-11 min-w-[max(2.75rem,calc(var(--switch-w)+1px))] shrink-0 items-center justify-center disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-(--switch-h) w-(--switch-w) rounded-full transition-colors duration-150 ease-standard",
          checked ? "bg-primary" : "bg-switch-off",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-(--switch-knob) rounded-full bg-switch-thumb shadow-thumb transition-transform duration-150 ease-standard",
            checked && "translate-x-[calc(var(--switch-w)-var(--switch-h))]",
          )}
        />
      </span>
    </button>
  );
}
