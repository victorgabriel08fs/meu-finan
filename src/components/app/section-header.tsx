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
        "mb-3 flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-1",
        className,
      )}
    >
      <h2 id={id} className="min-w-0 text-overline uppercase text-fg-3">
        {title}
      </h2>
      {action ? (
        <div className="ml-auto shrink-0 whitespace-nowrap">{action}</div>
      ) : null}
    </div>
  );
}
