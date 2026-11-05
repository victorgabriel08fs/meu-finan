"use client";

import { Lightbulb, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import type { Insight } from "@/server/domain/dashboard";
import { splitInsight } from "./labels";

/**
 * The map of the first release, shared by everyone on the device. Dropped on
 * the first read, not carried over: it cannot tell whose dismissals it holds.
 */
const LEGACY_KEY = "meu-finan:observacoes-dispensadas";
/** A dismissed insight stays hidden for 30 days (doc 02 §5.20). */
const HIDE_FOR_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * localStorage: { [insight.key]: dismissed at (ms) }, one map per person on
 * the device (CLAUDE.md › One device, several accounts).
 */
export function dismissedKey(userId: string): string {
  return `${LEGACY_KEY}:${userId}`;
}

export function readDismissed(userId: string): Record<string, number> {
  try {
    window.localStorage.removeItem(LEGACY_KEY);
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(dismissedKey(userId)) ?? "{}",
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

export function writeDismissed(
  userId: string,
  map: Record<string, number>,
): void {
  try {
    window.localStorage.setItem(dismissedKey(userId), JSON.stringify(map));
  } catch {
    // Storage unavailable: the insight comes back on the next visit.
  }
}

/**
 * InsightCard (doc 02 §5.20): one observation at a time, the figure in bold,
 * a ghost action to the category and a close button that hides it for 30
 * days, for this person on this device. Renders after hydration, once
 * storage was checked.
 */
export function InsightCard({
  insight,
  userId,
}: {
  insight: Insight;
  /** The session's user: whose dismissals to read and write. */
  userId: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissedAt = readDismissed(userId)[insight.key];
    setVisible(
      typeof dismissedAt !== "number" || Date.now() - dismissedAt > HIDE_FOR_MS,
    );
  }, [insight.key, userId]);

  if (!visible) return null;

  function dismiss() {
    const now = Date.now();
    const map = readDismissed(userId);
    for (const [key, at] of Object.entries(map)) {
      if (typeof at !== "number" || now - at > HIDE_FOR_MS) delete map[key];
    }
    map[insight.key] = now;
    writeDismissed(userId, map);
    setVisible(false);
  }

  const [before, figure, after] = splitInsight(insight.text);
  const positive = insight.tone === "positive";

  return (
    <section
      aria-label="Observação"
      className="flex items-start gap-3 rounded-card bg-surface p-4 shadow-card"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          positive
            ? "bg-primary-soft text-on-primary-soft"
            : "bg-warning-soft text-warning",
        )}
      >
        <Lightbulb className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
        <p className="text-body text-fg-2">
          {before}
          {figure ? (
            <strong className="text-headline font-bold text-fg">
              {figure}
            </strong>
          ) : null}
          {after}
        </p>
        <Link
          href={`/extrato?categoria=${insight.categoryId}`}
          className="-ml-1 inline-flex h-11 items-center self-start rounded-control px-1 text-callout font-bold text-primary hover:underline"
        >
          Ver {insight.categoryName}
        </Link>
      </div>
      <IconButton
        label="Dispensar observação"
        onClick={dismiss}
        className="-mt-2 -mr-2 text-fg-3 [&_svg]:size-5"
      >
        <X />
      </IconButton>
    </section>
  );
}
