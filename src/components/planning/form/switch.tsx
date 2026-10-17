import { cn } from "@/lib/utils";

type SwitchProps = {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Id of the visible label (preferred) … */
  labelledBy?: string;
  /** … or an accessible name when there is none. */
  label?: string;
  describedBy?: string;
  disabled?: boolean;
  className?: string;
};

/** On/off switch: 51 × 31 track, 44px tall target, role="switch". */
export function Switch({
  id,
  checked,
  onCheckedChange,
  labelledBy,
  label,
  describedBy,
  disabled,
  className,
}: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-11 w-13 shrink-0 items-center justify-center disabled:opacity-40",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-7.75 w-12.75 rounded-full transition-colors duration-150 ease-standard",
          checked ? "bg-primary" : "bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-6.75 rounded-full bg-switch-thumb shadow-thumb transition-transform duration-150 ease-standard",
            checked && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}
