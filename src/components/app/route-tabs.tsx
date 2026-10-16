"use client";

import { usePathname } from "next/navigation";
import {
  type SegmentedLink,
  SegmentedLinks,
} from "@/components/ui/segmented-control";

type RouteTabsProps = {
  items: SegmentedLink[];
  ariaLabel: string;
  className?: string;
};

/**
 * SegmentedLinks that finds the active item from the pathname (exact match or
 * any path below it). Meant for a section layout, where it persists across
 * pages and the thumb slides. usePathname can suspend under dynamic params, so
 * wrap it in <Suspense> with `<SegmentedLinks activeHref={null} />` as the
 * fallback.
 */
export function RouteTabs({ items, ariaLabel, className }: RouteTabsProps) {
  const pathname = usePathname();
  const active =
    items.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.href ?? null;
  return (
    <SegmentedLinks
      items={items}
      activeHref={active}
      ariaLabel={ariaLabel}
      className={className}
    />
  );
}
