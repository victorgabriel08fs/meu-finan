import {
  Banknote,
  Bell,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ReceiptText,
  Sun,
} from "lucide-react";
import type { ComponentType } from "react";
import type { NoticeIconName, NoticeTone } from "@/lib/notifications/kinds";
import { cn } from "@/lib/utils";

const ICONS: Record<NoticeIconName, ComponentType<{ className?: string }>> = {
  sun: Sun,
  receipt: ReceiptText,
  "calendar-clock": CalendarClock,
  banknote: Banknote,
  "calendar-days": CalendarDays,
  chart: ChartColumn,
  bell: Bell,
};

// Whole class names, so Tailwind sees them (doc 02 §3.1 tokens, both themes).
const TONES: Record<NoticeTone, string> = {
  primary: "bg-primary-soft text-on-primary-soft",
  "cat-1": "bg-cat-1-bg text-cat-1-fg",
  "cat-2": "bg-cat-2-bg text-cat-2-fg",
  "cat-3": "bg-cat-3-bg text-cat-3-fg",
  "cat-4": "bg-cat-4-bg text-cat-4-fg",
  "cat-5": "bg-cat-5-bg text-cat-5-fg",
  "cat-6": "bg-cat-6-bg text-cat-6-fg",
  "cat-7": "bg-cat-7-bg text-cat-7-fg",
  "cat-8": "bg-cat-8-bg text-cat-8-fg",
};

/** The 40px circle in front of a notice, drawn by its kind. */
export function NoticeIcon({
  icon,
  tone,
  className,
}: {
  icon: NoticeIconName;
  tone: NoticeTone;
  className?: string;
}) {
  const Icon = ICONS[icon] ?? Bell;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full",
        TONES[tone] ?? TONES.primary,
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}
