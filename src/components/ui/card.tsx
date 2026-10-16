import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type CardProps = ComponentProps<"div"> & {
  /** Renders the single child (e.g. a Link for a tappable card). */
  asChild?: boolean;
};

/** Card (doc 02 §5.3): --surface, 20px radius, 16px padding, elevation 1. */
export function Card({ className, asChild = false, ...props }: CardProps) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="card"
      className={cn("block rounded-card bg-surface p-4 shadow-card", className)}
      {...props}
    />
  );
}

/** Title on the left, optional action (ghost "Ver tudo") on the right. */
export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "mb-3 flex min-h-6 items-center justify-between gap-3",
        className,
      )}
      {...props}
    />
  );
}

type CardTitleProps = Omit<ComponentProps<"h2">, "ref"> & {
  /** Heading level that fits the page outline (default h2). */
  as?: "h2" | "h3" | "h4" | "p";
};

export function CardTitle({ className, as = "h2", ...props }: CardTitleProps) {
  const Comp = as;
  return (
    <Comp
      data-slot="card-title"
      className={cn("text-headline text-fg", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={className} {...props} />;
}
