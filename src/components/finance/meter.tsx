import {
  CalendarClock,
  CircleCheck,
  type LucideIcon,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type MeterStatus = "on_track" | "ahead" | "over" | "scheduled";

type MeterProps = {
  /** Spent so far, in the same unit as `max` (e.g. cents). */
  value: number;
  max: number;
  /** 0..1: share of the period already elapsed (the "today" marker). */
  pace?: number;
  status: MeterStatus;
  /** Scheduled but not yet paid: hatched segment after the spent one. */
  scheduled?: number;
  /** Accessible name, e.g. the category ("Mercado"). */
  label?: string;
  /** Spoken value, e.g. "640 de 900 reais, 71%, acima do ritmo". */
  valueText: string;
  className?: string;
};

const FILL: Record<MeterStatus, string> = {
  on_track: "bg-primary",
  ahead: "bg-warning-fill",
  over: "bg-danger-fill",
  scheduled: "bg-primary",
};

/** Same hue as the fill, drawn as hatching through currentColor. */
const HATCH: Record<MeterStatus, string> = {
  on_track: "text-primary",
  ahead: "text-warning-fill",
  over: "text-danger-fill",
  scheduled: "text-primary",
};

const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;

/**
 * Budget bar (doc 02 §5.9): 8px track; fill by status (--primary on track,
 * --warning-fill ahead of pace, --danger-fill and full when over); scheduled
 * spending as a 40% hatched segment; a 2×14px "today" marker. The status is
 * never color alone: pair it with <StatusLabel>.
 */
export function Meter({
  value,
  max,
  pace,
  status,
  scheduled = 0,
  label,
  valueText,
  className,
}: MeterProps) {
  const total = max > 0 ? max : 0;
  const ratio = (amount: number) => (total > 0 ? clamp01(amount / total) : 0);
  const spent = status === "over" ? 1 : ratio(value);
  const planned = Math.min(ratio(scheduled), 1 - spent);

  return (
    // biome-ignore lint/a11y/useSemanticElements: <meter> cannot draw the scheduled segment or the pace marker
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(Math.max(value, 0), total)}
      aria-valuetext={valueText}
      data-status={status}
      className={cn("relative h-2 w-full rounded-full bg-surface-2", className)}
    >
      <div className="meter-grow absolute inset-0 flex overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full",
            FILL[status],
            planned === 0 && "rounded-full",
          )}
          style={{ width: `${spent * 100}%` }}
        />
        {planned > 0 ? (
          <div
            className={cn("h-full bg-hatch opacity-40", HATCH[status])}
            style={{ width: `${planned * 100}%` }}
          />
        ) : null}
      </div>
      {pace === undefined ? null : (
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg ring-2 ring-surface"
          style={{ left: `${clamp01(pace) * 100}%` }}
        />
      )}
    </div>
  );
}

const STATUS: Record<
  MeterStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  on_track: { label: "No ritmo", icon: CircleCheck, className: "text-primary" },
  ahead: {
    label: "Acima do ritmo",
    icon: TriangleAlert,
    className: "text-warning",
  },
  over: { label: "Estourou", icon: OctagonAlert, className: "text-danger" },
  scheduled: { label: "Agendado", icon: CalendarClock, className: "text-fg-2" },
};

/** Budget status as icon + text (never color alone, doc 02 §5.9). */
export function StatusLabel({
  status,
  className,
}: {
  status: MeterStatus;
  className?: string;
}) {
  const { label, icon: Icon, className: tone } = STATUS[status];
  return (
    <span
      data-slot="status-label"
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-caption font-semibold",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </span>
  );
}
