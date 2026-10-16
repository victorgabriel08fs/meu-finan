"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useId, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_REPORT_PERIOD,
  PERIOD_LABELS,
  parseReportPeriod,
  periodQuery,
  REPORT_PERIODS,
  type ReportPeriod,
} from "./model";
import {
  REPORT_VIEWS,
  type ReportView,
  reportViewAt,
  reportViewHref,
} from "./views";

const UNDERLINE_SPRING = {
  type: "spring",
  stiffness: 500,
  damping: 40,
} as const;

/**
 * Report views (doc 02 §6.12) as route tabs that scroll sideways, with an
 * underline under the current one: Visão geral · Categorias · Fluxo ·
 * Patrimônio · Calendário. Period views keep `?periodo=` and month views keep
 * `?mes=`. Reads the URL, so render it inside <Suspense> with
 * <ReportTabsFallback /> (same tabs, links without the query).
 */
export function ReportTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = { periodo: params.get("periodo"), mes: params.get("mes") };
  return (
    <ReportTabsView
      active={reportViewAt(pathname)}
      hrefFor={(view) => reportViewHref(view, current)}
      className={className}
    />
  );
}

/** The tabs before the query is known: the current one is already marked. */
export function ReportTabsFallback({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <ReportTabsView
      active={reportViewAt(pathname)}
      hrefFor={(view) => view.path}
      className={className}
    />
  );
}

function ReportTabsView({
  active,
  hrefFor,
  className,
}: {
  active: ReportView | null;
  hrefFor: (view: ReportView) => string;
  className?: string;
}) {
  const layoutId = `report-tab-underline-${useId()}`;
  const listRef = useRef<HTMLUListElement>(null);
  const activePath = active?.path ?? null;

  // Bring the current tab into view (Calendário sits past the edge on phones).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !activePath) return;
    const link = list.querySelector<HTMLElement>('[aria-current="page"]');
    if (!link) return;
    const start = link.offsetLeft;
    const end = start + link.offsetWidth;
    if (start < list.scrollLeft || end > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = start - (list.clientWidth - link.offsetWidth) / 2;
    }
  }, [activePath]);

  return (
    <nav
      aria-label="Visões dos relatórios"
      className={cn("-mx-gutter border-b border-border md:mx-0", className)}
    >
      <ul
        ref={listRef}
        className="relative flex overflow-x-auto scroll-px-gutter px-gutter scrollbar-none mask-[linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1rem),transparent)] md:px-0 md:mask-none [&::-webkit-scrollbar]:hidden"
      >
        {REPORT_VIEWS.map((view) => {
          const current = view.path === activePath;
          return (
            <li key={view.path} className="shrink-0">
              <Link
                href={hrefFor(view)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center px-3 text-callout font-semibold whitespace-nowrap focus-visible:-outline-offset-2",
                  "transition-colors duration-150 ease-standard",
                  current ? "text-fg" : "text-fg-2 hover:text-fg",
                )}
              >
                {view.label}
                {current ? (
                  <motion.span
                    layoutId={layoutId}
                    transition={UNDERLINE_SPRING}
                    aria-hidden="true"
                    className="absolute inset-x-3 bottom-0 h-0.75 rounded-full bg-primary"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The period chips, only on the views that take a window of months
 * (Visão geral, Categorias, Patrimônio); Fluxo and Calendário switch months
 * in the page instead. Decides from the pathname, which is known while
 * prerendering, so a month view never flashes the chips.
 */
export function ReportPeriodFilter({ className }: { className?: string }) {
  const view = reportViewAt(usePathname());
  if (view?.filter !== "period") return null;
  return (
    <Suspense
      fallback={
        <PeriodSelectorView
          active={null}
          hrefFor={(value) => `${view.path}${periodQuery(value)}`}
          className={className}
        />
      }
    >
      <PeriodSelector className={className} />
    </Suspense>
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
