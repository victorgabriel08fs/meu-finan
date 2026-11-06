import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CLAMP_TEXT, CLAMP_TITLE } from "@/components/ui/clamp";
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
        "@container overflow-hidden rounded-2xl bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border",
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
  /** Anchor of a tip balloon (doc 02 §6.16). */
  "data-tip"?: string;
};

export function InsetListItem({
  label,
  description,
  icon,
  trailing,
  href,
  className,
  "data-tip": tip,
}: InsetListItemProps) {
  const content = (
    <>
      <span className="flex min-w-0 flex-[1_1_10rem] items-center gap-3">
        {icon ? (
          <span
            aria-hidden="true"
            className="flex size-[min(2rem,40px)] shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-[min(1.25rem,24px)]"
          >
            {icon}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("text-body font-semibold text-fg", CLAMP_TITLE)}>
            {label}
          </span>
          {description ? (
            <span className={cn("text-caption text-fg-3", CLAMP_TEXT)}>
              {description}
            </span>
          ) : null}
        </span>
      </span>
      {trailing || href ? (
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {trailing ? (
            <span className="flex items-center text-callout text-fg-2">
              {trailing}
            </span>
          ) : null}
          {href ? (
            <ChevronRight
              aria-hidden="true"
              className="size-5 shrink-0 text-fg-3"
            />
          ) : null}
        </span>
      ) : null}
    </>
  );

  const rowClass = cn(
    "flex min-h-13 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2",
    description && "min-h-16",
    className,
  );

  return (
    <li data-tip={tip}>
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
