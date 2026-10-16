import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Inset grouped list (doc 02 §6.14): 16px radius, 52px rows (64px with a
 * description), hairlines between rows.
 */
export function InsetList({
  children,
  className,
  "aria-labelledby": labelledBy,
}: {
  children: ReactNode;
  className?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <ul
      aria-labelledby={labelledBy}
      data-slot="inset-list"
      className={cn(
        "overflow-hidden rounded-2xl bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border",
        className,
      )}
    >
      {children}
    </ul>
  );
}

type InsetListItemProps = {
  label: ReactNode;
  /** Second line in caption --text-3. */
  description?: ReactNode;
  /** 20px icon (or a CategoryIcon) on the left. */
  icon?: ReactNode;
  /** Value or control on the right (text, a switch, a SegmentedControl…). */
  trailing?: ReactNode;
  /** Makes the row a link with a chevron. */
  href?: string;
  className?: string;
};

export function InsetListItem({
  label,
  description,
  icon,
  trailing,
  href,
  className,
}: InsetListItemProps) {
  const content = (
    <>
      {icon ? (
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-5"
        >
          {icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-semibold text-fg">
          {label}
        </span>
        {description ? (
          <span className="truncate text-caption text-fg-3">{description}</span>
        ) : null}
      </span>
      {trailing ? (
        <span className="flex shrink-0 items-center text-callout text-fg-2">
          {trailing}
        </span>
      ) : null}
      {href ? (
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-fg-3"
        />
      ) : null}
    </>
  );

  const rowClass = cn(
    "flex min-h-13 items-center gap-3 px-4 py-2",
    description && "min-h-16",
    className,
  );

  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={cn(
            rowClass,
            "-outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2",
          )}
        >
          {content}
        </Link>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  );
}
