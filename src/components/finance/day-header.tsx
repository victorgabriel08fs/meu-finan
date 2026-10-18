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
        "sticky top-(--app-bar-h) z-5 -mx-gutter flex h-10 items-center justify-between gap-3 bg-bg/92 px-gutter backdrop-blur-md",
        className,
      )}
    >
      <h2 className="truncate text-caption font-bold text-fg-2">{label}</h2>
      {totalCents === undefined ? null : (
        <Money
          cents={totalCents}
          variant="caption"
          sign="always"
          tone="neutral"
          className="font-semibold text-fg-2"
        />
      )}
    </div>
  );
}
