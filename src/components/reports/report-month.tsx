import { MonthSwitcher } from "@/components/app/month-switcher";
import { Skeleton } from "@/components/ui/skeleton";
import { periodLabel } from "@/lib/format/date";
import { monthViewHref } from "./views";

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
