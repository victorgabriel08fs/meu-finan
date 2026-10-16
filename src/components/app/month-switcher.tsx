import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { monthLabel, todayInTimeZone } from "@/lib/format/date";
import { cn } from "@/lib/utils";

type MonthSwitcherProps = {
  /** Month on screen, `YYYY-MM`. */
  month: string;
  /** URL that shows a given month (e.g. `?mes=2026-09`). */
  hrefFor: (month: string) => string;
  /**
   * Today's month, `YYYY-MM`. Defaults to the clock in São Paulo — fine inside
   * a request-time <Suspense> boundary; pass it explicitly anywhere else.
   */
  currentMonth?: string;
  className?: string;
};

/** "2026-10" ± n months, in plain integer math. */
export function shiftMonth(month: string, delta: number): string {
  const [year = 1970, monthNumber = 1] = month.split("-").map(Number);
  const index = year * 12 + (monthNumber - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

/**
 * Active period switcher (doc 02 §4.3): `‹ outubro de 2026 ›` with 44px arrow
 * links, plus a "Voltar para hoje" chip away from the current month. Plain
 * links (no client JS), so the browser back button undoes a switch.
 */
export function MonthSwitcher({
  month,
  hrefFor,
  currentMonth,
  className,
}: MonthSwitcherProps) {
  const current = currentMonth ?? todayInTimeZone().slice(0, 7);
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const arrowClass =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg-2 transition-[background-color,scale] duration-100 hover:bg-surface-2 active:scale-94 active:bg-surface-3";

  return (
    <div
      data-slot="month-switcher"
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-2 gap-y-1",
        className,
      )}
    >
      <div className="flex items-center gap-1">
        <Link
          href={hrefFor(previous)}
          aria-label={`Mês anterior: ${monthLabel(previous)}`}
          className={arrowClass}
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
        </Link>
        <p
          aria-live="polite"
          className="min-w-38 text-center text-headline text-fg"
        >
          {monthLabel(month)}
        </p>
        <Link
          href={hrefFor(next)}
          aria-label={`Próximo mês: ${monthLabel(next)}`}
          className={arrowClass}
        >
          <ChevronRight aria-hidden="true" className="size-6" />
        </Link>
      </div>
      {month === current ? null : (
        <Link
          href={hrefFor(current)}
          className="relative inline-flex h-8 items-center rounded-full bg-primary-soft px-3 text-caption font-semibold text-on-primary-soft transition-transform duration-100 after:absolute after:inset-x-0 after:-inset-y-1.5 active:scale-97"
        >
          Voltar para hoje
        </Link>
      )}
    </div>
  );
}
