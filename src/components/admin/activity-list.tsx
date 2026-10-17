import {
  Activity,
  KeyRound,
  Link2,
  Link2Off,
  LogOut,
  ShieldCheck,
  Sparkles,
  ToggleRight,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DayHeader } from "@/components/finance/day-header";
import { Button } from "@/components/ui/button";
import { type ActivityKind, describeActivity } from "@/lib/admin/activity";
import { dayHeaderLabel } from "@/lib/format/date";
import { clockLabel, localDayOf } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import type { AuditItem } from "@/server/domain/audit";

const ICONS: Record<ActivityKind, ReactNode> = {
  setup: <Sparkles />,
  invite: <UserPlus />,
  link: <Link2 />,
  link_revoked: <Link2Off />,
  accepted: <KeyRound />,
  ban: <UserX />,
  unban: <UserCheck />,
  sessions: <LogOut />,
  role: <ShieldCheck />,
  delete: <Trash2 />,
  flag: <ToggleRight />,
  other: <Activity />,
};

/**
 * Administração › Atividade (doc 02 §6.16): the audit trail, newest first,
 * one card per day under the statement's day headers. Read only.
 */
export function ActivityList({
  items,
  viewerId,
  now,
  nextHref,
  firstPageHref,
}: {
  items: AuditItem[];
  viewerId: string;
  /** ISO time of the render, for "Hoje" and "Ontem". */
  now: string;
  /** Link to older entries, when there are more. */
  nextHref: string | null;
  /** Link back to the newest entries, when this is not the first page. */
  firstPageHref: string | null;
}) {
  const today = localDayOf(now);
  const days: { day: string; items: AuditItem[] }[] = [];
  for (const item of items) {
    const day = localDayOf(item.createdAt);
    const last = days.at(-1);
    if (last?.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }

  return (
    <div className="flex flex-col gap-2">
      {days.map((group) => (
        <section key={group.day} aria-label={dayHeaderLabel(group.day, today)}>
          <DayHeader label={dayHeaderLabel(group.day, today)} />
          <ol className="overflow-hidden rounded-2xl bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border">
            {group.items.map((item) => {
              const line = describeActivity(item, viewerId);
              return (
                <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-[18px]",
                      line.kind === "delete"
                        ? "bg-danger-soft text-danger"
                        : "bg-surface-2 text-fg-2",
                    )}
                  >
                    {ICONS[line.kind]}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-body text-fg">{line.title}</p>
                    {line.detail ? (
                      <p className="break-words text-caption text-fg-3">
                        {line.detail}
                      </p>
                    ) : null}
                  </div>
                  <time
                    dateTime={item.createdAt}
                    className="mt-0.5 shrink-0 text-caption text-fg-3 tabular-nums"
                  >
                    {clockLabel(item.createdAt)}
                  </time>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {nextHref || firstPageHref ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {nextHref ? (
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <Link href={nextHref} prefetch={false}>
                Ver ações mais antigas
              </Link>
            </Button>
          ) : null}
          {firstPageHref ? (
            <Button asChild variant="ghost" className="w-full sm:w-auto">
              <Link href={firstPageHref}>Voltar para as mais recentes</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
