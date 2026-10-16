import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Button (doc 02 §5.1). One `primary` per screen or sheet; `destructive` only
 * in confirmation dialogs. Sizes: lg 52px (sheet footers, add `w-full`),
 * md 44px, sm 36px with the touch area extended to 44px.
 */
export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control",
    "text-headline transition-[scale,background-color,color,filter,opacity] duration-100 ease-standard",
    "active:scale-97 active:brightness-94 disabled:pointer-events-none disabled:opacity-40",
    "aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary",
        tonal: "bg-primary-soft text-on-primary-soft",
        secondary:
          "bg-surface-2 text-fg active:bg-surface-3 active:brightness-100",
        ghost:
          "bg-transparent text-primary hover:bg-primary-soft/60 active:bg-primary-soft active:brightness-100",
        destructive: "bg-destructive text-white",
      },
      size: {
        lg: "h-13 px-6",
        md: "h-11 px-5",
        sm: "h-9 px-3.5 text-callout font-semibold after:absolute after:inset-x-0 after:-inset-y-1",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Renders the single child (a Link, an <a>) with the button styles. */
    asChild?: boolean;
    /** Shows a spinner, keeps the width and sets aria-busy; also disables. */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  type,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        className={classes}
        aria-busy={loading || undefined}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="button"
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          {/* Transparent, not hidden: the label keeps the width and stays the accessible name. */}
          <span className="inline-flex items-center gap-2 opacity-0">
            {children}
          </span>
          <LoaderCircle aria-hidden="true" className="absolute animate-spin" />
        </>
      ) : (
        children
      )}
    </button>
  );
}
