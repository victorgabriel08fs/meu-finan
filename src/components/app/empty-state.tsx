import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  /** A Lucide icon element, e.g. `<ReceiptText />` (drawn at 48px). */
  icon: ReactNode;
  title: string;
  description: ReactNode;
  /** Next step: a primary or tonal Button. */
  action?: ReactNode;
  className?: string;
};

/**
 * Empty state (doc 02 §5.16, §8): line icon in an 88px --surface-2 circle,
 * title-3, a body line in --text-2 and one clear next step. No illustrations.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <section
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center px-6 py-10 text-center",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex size-22 items-center justify-center rounded-full bg-surface-2 text-fg-2 [&_svg]:size-12 [&_svg]:stroke-[1.5]"
      >
        {icon}
      </div>
      <h2 className="mt-5 text-title-3 text-balance text-fg">{title}</h2>
      <p className="mt-2 max-w-sm text-body text-pretty text-fg-2">
        {description}
      </p>
      {action ? (
        <div className="mt-6 flex flex-col items-center gap-2">{action}</div>
      ) : null}
    </section>
  );
}
