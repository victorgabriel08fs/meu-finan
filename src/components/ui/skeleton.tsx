import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Placeholder block (doc 02 §5.17). Give it the exact size of the content it
 * stands for, so nothing shifts when the data streams in.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn("skeleton rounded-control", className)}
      {...props}
    />
  );
}

type LoadingRegionProps = {
  children: ReactNode;
  /** Announced to screen readers while the skeletons are on screen. */
  label?: string;
  className?: string;
};

/** Wraps a group of skeletons in a polite status region ("Carregando…"). */
export function LoadingRegion({
  children,
  label = "Carregando…",
  className,
}: LoadingRegionProps) {
  return (
    <output aria-live="polite" className={cn("block", className)}>
      <span className="sr-only">{label}</span>
      {children}
    </output>
  );
}
