"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SegmentedLinks } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import {
  DEFAULT_REPORT_PERIOD,
  PERIOD_LABELS,
  parseReportPeriod,
  periodQuery,
  REPORT_PERIODS,
  type ReportPeriod,
} from "./model";

const VIEWS = [
  { path: "/relatorios/visao-geral", label: "Visão geral" },
  { path: "/relatorios/categorias", label: "Categorias" },
] as const;

/**
 * Report views (doc 02 §6.12) as route tabs that keep `?periodo=`: the one
 * period filter applies to every view. Reads the URL, so render it inside
 * <Suspense> with <ReportTabsFallback /> (same look, nothing selected).
 */
export function ReportTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  const period = parseReportPeriod(useSearchParams().get("periodo"));
  const query = periodQuery(period);
  const items = VIEWS.map((view) => ({
    href: `${view.path}${query}`,
    label: view.label,
  }));
  const active = VIEWS.findIndex(
    (view) => pathname === view.path || pathname.startsWith(`${view.path}/`),
  );
  return (
    <SegmentedLinks
      items={items}
      activeHref={active === -1 ? null : (items[active]?.href ?? null)}
      ariaLabel="Visões dos relatórios"
      className={className}
    />
  );
}

export function ReportTabsFallback({ className }: { className?: string }) {
  return (
    <SegmentedLinks
      items={VIEWS.map((view) => ({ href: view.path, label: view.label }))}
      activeHref={null}
      ariaLabel="Visões dos relatórios"
      className={className}
    />
  );
}

/**
 * Period filter row (Mês · 3M · 6M · 12M): links that set `?periodo=` on the
 * current view, so the back button undoes a change. Render inside <Suspense>
 * with <PeriodSelectorView active={null} /> as the fallback.
 */
export function PeriodSelector({ className }: { className?: string }) {
  const pathname = usePathname();
  const period = parseReportPeriod(useSearchParams().get("periodo"));
  return (
    <PeriodSelectorView
      active={period}
      hrefFor={(value) => `${pathname}${periodQuery(value)}`}
      className={className}
    />
  );
}

export function PeriodSelectorView({
  active,
  hrefFor = (value) => `/relatorios/visao-geral${periodQuery(value)}`,
  className,
}: {
  active: ReportPeriod | null;
  hrefFor?: (period: ReportPeriod) => string;
  className?: string;
}) {
  return (
    <nav aria-label="Período dos relatórios" className={className}>
      <ul className="flex flex-wrap gap-2">
        {REPORT_PERIODS.map((value) => {
          const selected = value === active;
          const labels = PERIOD_LABELS[value];
          return (
            <li key={value}>
              <Link
                href={hrefFor(value)}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "relative inline-flex h-9 min-w-12 items-center justify-center rounded-full border px-3.5 text-callout font-semibold",
                  "transition-[background-color,border-color,color,scale] duration-100 ease-standard active:scale-97",
                  "after:absolute after:inset-x-0 after:-inset-y-1",
                  selected
                    ? "border-primary bg-primary-soft font-bold text-on-primary-soft"
                    : "border-border bg-surface text-fg hover:bg-surface-2/60",
                )}
              >
                <span aria-hidden="true">{labels.short}</span>
                <span className="sr-only">
                  {labels.long}
                  {value === DEFAULT_REPORT_PERIOD ? " (padrão)" : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
