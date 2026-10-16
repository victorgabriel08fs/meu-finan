import {
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { GoalStatus } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { GOAL_STATUS, type StatusPill } from "./model";

const PILL_ICON: Record<StatusPill["icon"], typeof CircleCheck> = {
  check: CircleCheck,
  ahead: ArrowUpRight,
  behind: TriangleAlert,
  none: CircleDashed,
};

/** Status of a goal (doc 03 §8): icon + label, never color alone. */
export function GoalStatusPill({
  status,
  className,
}: {
  status: GoalStatus;
  className?: string;
}) {
  const pill = GOAL_STATUS[status];
  const Icon = PILL_ICON[pill.icon];
  return (
    <Badge
      tone={pill.tone}
      className={cn("h-6.5 rounded-full px-2.5", className)}
    >
      <Icon aria-hidden="true" />
      {pill.label}
    </Badge>
  );
}
