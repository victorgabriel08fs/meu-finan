"use client";

import {
  ChartLine,
  ChevronRight,
  FileUp,
  Smartphone,
  Sparkles,
  SunMoon,
  Target,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { fullDateLabel } from "@/lib/format/date";
import type { TipIcon } from "@/lib/tips";
import { useTipsStore } from "@/stores/tips";

export type NewsEntry = {
  id: string;
  title: string;
  body: string;
  /** YYYY-MM-DD. */
  since: string;
  icon: TipIcon;
  link: { href: string; label: string } | null;
  /** Not seen before this visit: "Nova". */
  unread: boolean;
};

const ICONS: Record<TipIcon, ReactNode> = {
  target: <Target />,
  chart: <ChartLine />,
  "file-up": <FileUp />,
  smartphone: <Smartphone />,
  sparkles: <Sparkles />,
  "sun-moon": <SunMoon />,
};

/** Entries grouped by day, newest day first (the feed comes sorted). */
function byDay(entries: NewsEntry[]): [string, NewsEntry[]][] {
  const days = new Map<string, NewsEntry[]>();
  for (const entry of entries) {
    days.set(entry.since, [...(days.get(entry.since) ?? []), entry]);
  }
  return [...days];
}

/**
 * Ajustes › Novidades (doc 02 §6.16). Opening the page reads the novidades:
 * the dot goes away at once, and they keep the "Nova" badge until the next
 * visit, so it is clear what was new.
 */
export function NewsList({ entries }: { entries: NewsEntry[] }) {
  const markSeen = useTipsStore((store) => store.markSeen);
  const unread = useRef(
    entries.filter((entry) => entry.unread).map((entry) => entry.id),
  );
  useEffect(() => {
    if (unread.current.length > 0) markSeen(unread.current);
  }, [markSeen]);

  return (
    <>
      {entries.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-5 text-callout text-fg-2 shadow-card">
          Nada de novo por aqui ainda. Quando algo chegar ao app, aparece nesta
          lista.
        </p>
      ) : (
        byDay(entries).map(([day, items]) => (
          <section
            key={day}
            aria-labelledby={`novidades-${day}`}
            className="flex flex-col gap-3"
          >
            <h2
              id={`novidades-${day}`}
              className="text-overline text-fg-3 uppercase"
            >
              <time dateTime={day}>{fullDateLabel(day)}</time>
            </h2>
            <ul className="overflow-hidden rounded-2xl bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border">
              {items.map((entry) => (
                <NewsItem key={entry.id} entry={entry} />
              ))}
            </ul>
          </section>
        ))
      )}
      <p className="px-1 text-caption text-fg-3">
        As dicas de cada tela você desliga ou revê em{" "}
        <Link
          href="/ajustes/preferencias"
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          Preferências
        </Link>
        .
      </p>
    </>
  );
}

function NewsItem({ entry }: { entry: NewsEntry }) {
  return (
    <li className="flex gap-3 px-4 py-4">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-soft text-on-primary-soft [&_svg]:size-5"
      >
        {ICONS[entry.icon]}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="pt-0.5 text-headline text-fg">{entry.title}</h3>
          {entry.unread ? (
            <Badge tone="primary" className="mt-0.5">
              Nova
            </Badge>
          ) : null}
        </div>
        <p className="text-callout text-pretty text-fg-2">{entry.body}</p>
        {entry.link ? (
          <Link
            href={entry.link.href}
            className="-ml-2 inline-flex h-9 items-center gap-0.5 self-start rounded-chip px-2 text-callout font-semibold text-primary transition-colors duration-100 hover:bg-primary-soft/60 active:bg-primary-soft"
          >
            {entry.link.label}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>
    </li>
  );
}
