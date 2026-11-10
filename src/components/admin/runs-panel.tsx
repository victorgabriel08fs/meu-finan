"use client";

import { useState } from "react";
import type { RunLine } from "@/lib/admin/routine";
import { RunList } from "./run-list";
import { RunNowButton } from "./run-now-button";

export type RunItem = { id: string; line: RunLine };

/**
 * "Rodar agora" and the list of runs side by side: the run that just
 * finished opens expanded once the page has refreshed with it.
 */
export function RunsPanel({ items }: { items: RunItem[] }) {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const [revealId, setRevealId] = useState<string | null>(null);

  const toggle = (id: string) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <>
      <RunNowButton
        onFinished={(id) => {
          setOpenIds((c) => new Set(c).add(id));
          setRevealId(id);
        }}
      />
      <RunList
        items={items}
        openIds={openIds}
        onToggle={toggle}
        revealId={revealId}
      />
    </>
  );
}
