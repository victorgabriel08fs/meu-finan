import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

type BlockInviteProps = {
  /** A Lucide icon element, e.g. `<CalendarDays />` (drawn at 20px). */
  icon: ReactNode;
  title: string;
  description: ReactNode;
  /** The next step: a tonal or secondary `sm` button. */
  action?: ReactNode;
};

/**
 * A block of the Início with nothing to show (doc 02 §6.3, §8): a compact
 * invite in its place — icon, title, one line and the next step, wrapping
 * under them when the block is narrow — instead of an empty chart.
 */
export function BlockInvite({
  icon,
  title,
  description,
  action,
}: BlockInviteProps) {
  return (
    <Card className="flex flex-wrap items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft [&_svg]:size-5"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 basis-48 flex-col">
        <h2 className="text-headline text-fg">{title}</h2>
        <p className="text-caption text-fg-3">{description}</p>
      </div>
      {action}
    </Card>
  );
}
