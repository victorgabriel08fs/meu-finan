import { CalendarClock } from "lucide-react";
import type { NonBusinessDue } from "@/lib/finance/business-days";
import { nonBusinessDetail, nonBusinessShort } from "@/lib/format/due-day";
import { cn } from "@/lib/utils";

type NonBusinessHintProps =
  | {
      nb: NonBusinessDue;
      variant?: "row";
      /**
       * Where the row line sits. `column`: under the subtitle, beside the
       * amount. `below`: the whole width of the row, under everything. A row
       * renders both; the container query shows one: `column` normally,
       * `below` once the row is narrower than 16rem (large text), so the
       * line never squeezes into the narrow column (doc 02 §8).
       */
      placement?: "column" | "below";
      className?: string;
    }
  | {
      nb: NonBusinessDue;
      variant: "detail";
      /** `YYYY-MM-DD`. */
      dueOn: string;
      /** `YYYY-MM-DD`, in the user's time zone. */
      today: string;
      className?: string;
    };

/**
 * A bill due on a non-business day (doc 02 §6.3, §6.4, §6.8): information,
 * not an alert. `row` is the line of a list row ("Dia não útil · passa para
 * seg, 16 nov"), in --text-3 like the subtitle, at most 2 lines beside the
 * amount; rows add the spoken form to their accessible name. `detail` is the
 * note box of the invoice (--text-2, --text-3 icon), with when to pay to
 * avoid waiting. No amounts: the discreet mode does not change it.
 */
export function NonBusinessHint(props: NonBusinessHintProps) {
  if (props.variant === "detail") {
    return (
      <p
        className={cn(
          "flex items-start gap-2 rounded-control bg-bg px-3 py-2.5 text-callout text-fg-2",
          props.className,
        )}
      >
        <CalendarClock
          aria-hidden="true"
          className="size-5 shrink-0 text-fg-3"
        />
        <span className="min-w-0">
          {nonBusinessDetail(props.nb, props.dueOn, props.today)}
        </span>
      </p>
    );
  }
  const below = props.placement === "below";
  return (
    <span
      data-slot="non-business-hint"
      className={cn(
        "min-w-0 items-start gap-1 text-caption text-fg-3",
        below ? "hidden basis-full @max-tight:flex" : "flex @max-tight:hidden",
        props.className,
      )}
    >
      <CalendarClock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span className={cn("min-w-0", !below && "line-clamp-2")}>
        {nonBusinessShort(props.nb)}
      </span>
    </span>
  );
}
