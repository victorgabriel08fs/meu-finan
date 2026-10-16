import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Badge / "selo" (doc 02 §5.12): 22px, 6px radius, caption 600. */
export const badgeVariants = cva(
  "inline-flex h-5.5 shrink-0 items-center gap-1 whitespace-nowrap rounded-badge px-1.5 text-caption font-semibold tabular-nums [&_svg]:size-3.5 [&_svg]:shrink-0",
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
