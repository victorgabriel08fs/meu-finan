import Link from "next/link";
import { MonthSwitcher } from "@/components/app/month-switcher";
import { Skeleton } from "@/components/ui/skeleton";
import { monthLabel, periodLabel } from "@/lib/format/date";
import type { ReportPeriod } from "./model";
import { monthViewHref, periodHref } from "./views";

type ReportMonthSwitcherProps = {
  /** The view, e.g. `/relatorios/fluxo`. */
  path: string;
  /** Month on screen and today's month, `YYYY-MM`. */
  month: string;
  currentMonth: string;
  /** The financial month, both ends included (`YYYY-MM-DD`). */
  start: string;
  end: string;
  /** The user's months start on another day than the 1st: show "5/out – 4/nov". */
  showRange: boolean;
};

/**
 * Month filter of Fluxo and Calendário (doc 02 §4.3): `‹ outubro de 2026 ›`
 * with "Voltar para hoje", plain links that keep the browser history.
 */
export function ReportMonthSwitcher({
  path,
  month,
  currentMonth,
  start,
  end,
  showRange,
}: ReportMonthSwitcherProps) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <MonthSwitcher
        month={month}
        currentMonth={currentMonth}
        hrefFor={(target) => monthViewHref(path, target, currentMonth)}
      />
      {showRange ? (
        <p className="text-caption text-fg-3">{periodLabel(start, end)}</p>
      ) : null}
    </div>
  );
}

export function ReportMonthSwitcherSkeleton() {
  return <Skeleton className="mx-auto h-11 w-64 rounded-full" />;
}

/**
 * Where a window of months ends, when it is not the current month ("Até
 * outubro de 2026", or "Mostrando outubro de 2026" for a single month), with
 * the way back to today. Under the period chips; renders nothing for today.
 */
export function ReportEndNote({
  path,
  period,
  month,
  currentMonth,
}: {
  path: string;
  period: ReportPeriod;
  month: string;
  currentMonth: string;
}) {
  if (month === currentMonth) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="text-callout text-fg-2">
        {period === 1 ? "Mostrando " : "Até "}
        <strong className="font-semibold text-fg">{monthLabel(month)}</strong>
      </p>
      <Link
        href={periodHref(path, period, null)}
        className="inline-flex h-11 items-center rounded-control px-2 text-callout font-semibold text-primary transition-colors duration-100 hover:bg-primary-soft/60 active:bg-primary-soft"
      >
        Voltar para hoje
      </Link>
    </div>
  );
}
