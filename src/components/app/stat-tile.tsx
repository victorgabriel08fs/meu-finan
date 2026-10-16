import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatTileProps = {
  /** 32px icon chip content, e.g. `<ArrowDownLeft />`. */
  icon?: ReactNode;
  /** Classes for the icon chip (default --surface-2 / --text-2). */
  iconClassName?: string;
  label: string;
  /** Usually `<Money variant="title" … />`. */
  value: ReactNode;
  /** Support line: a delta (<StatDelta>) or a complement ("R$ 650 a receber"). */
  support?: ReactNode;
  /** Makes the whole tile a link. */
  href?: string;
  className?: string;
};

/**
 * Stat tile (doc 02 §5.11): icon + caption label, a title-2 value with
 * proportional figures and an optional caption support line.
 */
export function StatTile({
  icon,
  iconClassName,
  label,
  value,
  support,
  href,
  className,
}: StatTileProps) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        {icon ? (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2 [&_svg]:size-4.5",
              iconClassName,
            )}
          >
            {icon}
          </span>
        ) : null}
        <span className="truncate text-caption text-fg-2">{label}</span>
      </div>
      <div className="mt-3 text-title-2 text-fg">{value}</div>
      {support ? (
        <div className="mt-1 text-caption text-fg-3">{support}</div>
      ) : null}
    </>
  );

  const classes = cn("flex min-w-0 flex-col", className);
  if (!href) {
    return (
      <Card data-slot="stat-tile" className={classes}>
        {body}
      </Card>
    );
  }
  return (
    <Card
      asChild
      data-slot="stat-tile"
      className={cn(
        classes,
        "transition-transform duration-100 ease-standard active:scale-98",
      )}
    >
      <Link href={href}>{body}</Link>
    </Card>
  );
}

type StatDeltaProps = {
  direction: "up" | "down" | "flat";
  /** Meaning, not direction: spending less is good (--income). */
  tone: "good" | "bad" | "neutral";
  children: ReactNode;
  className?: string;
};

const DELTA_ICON = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: ArrowRight,
} as const;

const DELTA_TONE = {
  good: "text-income",
  bad: "text-warning",
  neutral: "text-fg-3",
} as const;

/** Delta line: arrow + value + "vs set", colored by meaning (§5.11). */
export function StatDelta({
  direction,
  tone,
  children,
  className,
}: StatDeltaProps) {
  const Icon = DELTA_ICON[direction];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-caption font-semibold",
        DELTA_TONE[tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}
