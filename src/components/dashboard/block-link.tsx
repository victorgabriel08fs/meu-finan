import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The way from a block of the Início to its screen ("Ver relatório"): a
 * ghost link 44px tall beside the heading, pulled into the card's padding so
 * the text lines up with the edge.
 */
export function BlockLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "-my-1.5 -mr-2 inline-flex h-11 shrink-0 items-center rounded-control px-2 text-callout font-semibold text-primary transition-colors duration-100 hover:bg-primary-soft/60 active:bg-primary-soft",
        className,
      )}
    >
      {children}
    </Link>
  );
}
