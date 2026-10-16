import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type IconButtonProps = ComponentProps<"button"> & {
  /** Accessible name; an icon alone is never enough (§3.9). */
  label: string;
  /** Renders the single child (a Link) with the icon-button styles. */
  asChild?: boolean;
  /** `true` draws an 8px dot; a number draws a count (capped at 99+). */
  badge?: boolean | number;
};

/** IconButton (doc 02 §5.2): 44×44 target, round, transparent until pressed. */
export function IconButton({
  label,
  asChild = false,
  badge,
  className,
  type,
  children,
  ...props
}: IconButtonProps) {
  const classes = cn(
    "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg-2",
    "transition-[background-color,scale] duration-100 ease-standard hover:bg-surface-2 active:scale-94 active:bg-surface-3",
    "disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-6 [&_svg]:shrink-0",
    className,
  );
  const indicator = renderBadge(badge);

  if (asChild) {
    return (
      <Slot.Root
        data-slot="icon-button"
        aria-label={label}
        className={classes}
        {...props}
      >
        <Slot.Slottable>{children}</Slot.Slottable>
        {indicator}
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="icon-button"
      type={type ?? "button"}
      aria-label={label}
      className={classes}
      {...props}
    >
      {children}
      {indicator}
    </button>
  );
}

function renderBadge(badge: IconButtonProps["badge"]) {
  if (badge === undefined || badge === false || badge === 0) return null;
  if (badge === true) {
    return (
      <span
        aria-hidden="true"
        className="absolute top-2 right-2 size-2 rounded-full bg-danger ring-2 ring-surface"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-micro text-surface tabular-nums"
    >
      {badge > 99 ? "99+" : badge}
    </span>
  );
}
