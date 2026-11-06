import { Money } from "@/components/money/money";
import { cn } from "@/lib/utils";

type DayHeaderProps = {
  /** "Hoje · ter, 14 out" — see dayHeaderLabel in @/lib/format/date. */
  label: string;
  /** Net total of the day, signed cents. */
  totalCents?: number;
  className?: string;
};

/**
 * Day header of a statement list (doc 02 §5.8), also used by the other lists
 * grouped by day (Administração › Atividade, Ajustes › Novidades): sticks
 * under the app bar while its day scrolls by, on --bg at 92% with a blur.
 */
export function DayHeader({ label, totalCents, className }: DayHeaderProps) {
  return (
    <div
      data-slot="day-header"
      className={cn(
        "sticky top-(--app-bar-h) z-5 -mx-gutter flex min-h-10 flex-wrap items-center gap-x-3 bg-bg/92 px-gutter py-1 backdrop-blur-md",
        className,
      )}
    >
      <h2 className="min-w-0 flex-[1_1_8rem] truncate text-caption font-bold text-fg-2">
        {label}
      </h2>
      {/* Never cut (§8): with large text the total wraps under the day. */}
      {totalCents === undefined ? null : (
        <Money
          cents={totalCents}
          variant="caption"
          sign="always"
          tone="neutral"
          className="ml-auto shrink-0 font-semibold text-fg-2"
        />
      )}
    </div>
  );
}
