"use client";

import { Lightbulb, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import type { Insight } from "@/server/domain/dashboard";
import { splitInsight } from "./labels";

/** localStorage: { [insight.key]: dismissed at (ms) }, one map per device. */
const STORAGE_KEY = "meu-finan:observacoes-dispensadas";
/** A dismissed insight stays hidden for 30 days (doc 02 §5.20). */
const HIDE_FOR_MS = 30 * 24 * 60 * 60 * 1000;

function readDismissed(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

function writeDismissed(map: Record<string, number>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable: the insight comes back on the next visit.
  }
}

/**
 * InsightCard (doc 02 §5.20): one observation at a time, the figure in bold,
 * a ghost action to the category and a close button that hides it for 30
 * days on this device. Renders after hydration, once storage was checked.
 */
export function InsightCard({ insight }: { insight: Insight }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissedAt = readDismissed()[insight.key];
    setVisible(
      typeof dismissedAt !== "number" || Date.now() - dismissedAt > HIDE_FOR_MS,
    );
  }, [insight.key]);

  if (!visible) return null;

  function dismiss() {
    const now = Date.now();
    const map = readDismissed();
    for (const [key, at] of Object.entries(map)) {
      if (typeof at !== "number" || now - at > HIDE_FOR_MS) delete map[key];
    }
    map[insight.key] = now;
    writeDismissed(map);
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
