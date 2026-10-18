"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { unreadNewsIds } from "@/lib/tips";
import { cn } from "@/lib/utils";
import { useTipsStore } from "@/stores/tips";

/**
 * Unread novidades (doc 02 §6.16): a dot where Ajustes is reached (the avatar
 * on the Início, the sidebar) and a count on its "Novidades" row.
 */

/** Ids of the novidades the user has not seen; empty until the tips load. */
export function useUnreadNews(): string[] {
  const loaded = useTipsStore((store) => store.loaded);
  const seen = useTipsStore((store) => store.seen);
  const createdOn = useTipsStore((store) => store.createdOn);
  const context = useTipsStore((store) => store.context);
  return useMemo(
    () => (loaded ? unreadNewsIds({ seen, createdOn, context }) : []),
    [loaded, seen, createdOn, context],
  );
}

const countLabel = (count: number) =>
  count === 1 ? "1 novidade" : `${count} novidades`;

/**
 * An 8px --primary dot (new, not an alert: never --danger) with its meaning
 * for screen readers. Quiet while tips are off ("Não mostrar mais dicas").
 */
export function NewsDot({ className }: { className?: string }) {
  const unread = useUnreadNews();
  const off = useTipsStore((store) => store.off);
  if (unread.length === 0 || off) return null;
  return (
    <span
      data-slot="news-dot"
      className={cn(
        "pointer-events-none absolute size-2.5 rounded-full bg-primary ring-2 ring-bg",
        className,
      )}
    >
      <span className="sr-only">, {countLabel(unread.length)}</span>
    </span>
  );
}

/** "2 novas" on the Ajustes row, even with tips off. */
export function NewsBadge() {
  const unread = useUnreadNews();
  if (unread.length === 0) return null;
  return (
    <Badge tone="primary">
      {unread.length === 1 ? "1 nova" : `${unread.length} novas`}
    </Badge>
  );
}

/**
 * "Ligadas" or "Desligadas" on the Ajustes row of the tips: `fallback`, the
 * server's value, until the tips load (or when they fail to).
 */
export function TipsStateLabel({ fallback }: { fallback: boolean }) {
  const loaded = useTipsStore((store) => store.loaded);
  const off = useTipsStore((store) => store.off);
  return (loaded ? off : fallback) ? "Desligadas" : "Ligadas";
}
