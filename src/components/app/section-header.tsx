import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  title: string;
  /** Optional ghost action on the right ("Ver tudo"). */
  action?: ReactNode;
  id?: string;
  className?: string;
};

/**
 * Section header outside cards (doc 02 §5.3): overline in --text-3, e.g.
 * "PRÓXIMAS CONTAS". Spacing: 28px above (gap-7 in the page), 12px below.
 */
export function SectionHeader({
  title,
  action,
  id,
  className,
}: SectionHeaderProps) {
  return (
    <div
      data-slot="section-header"
      className={cn(
        "mb-3 flex min-h-6 items-center justify-between gap-3",
        className,
      )}
    >
      <h2 id={id} className="text-overline uppercase text-fg-3">
        {title}
      </h2>
      {action}
    </div>
  );
}
