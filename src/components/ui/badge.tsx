import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Badge / "selo" (doc 02 §5.12): 22px (more when the text wraps), 6px radius, caption 600. */
export const badgeVariants = cva(
  "inline-flex min-h-5.5 max-w-full shrink-0 items-center gap-1 rounded-badge px-1.5 py-0.5 text-caption text-balance font-semibold tabular-nums [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-fg-2",
        primary: "bg-primary-soft text-on-primary-soft",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
        transfer: "bg-transfer-soft text-transfer",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}
