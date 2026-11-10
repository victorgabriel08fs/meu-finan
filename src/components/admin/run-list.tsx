"use client";

import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Loader,
  SkipForward,
} from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { SectionHeader } from "@/components/app/section-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { CLAMP_TEXT } from "@/components/ui/clamp";
import type { RunLine, StepLine } from "@/lib/admin/routine";
import { cn } from "@/lib/utils";
import type { RunItem } from "./runs-panel";

const STATUS_ICONS: Record<
  RunLine["status"] | StepLine["status"],
  typeof Loader
> = {
  ok: CircleCheck,
  partial: CircleAlert,
  failed: CircleX,
  running: Loader,
  interrupted: CircleX,
  rejected: CircleX,
  skipped: SkipForward,
};

function StatusBadge({
  status,
  label,
  tone,
}: {
  status: keyof typeof STATUS_ICONS;
  label: string;
  tone: BadgeTone;
}) {
  const Icon = STATUS_ICONS[status];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

/**
 * "Últimas execuções" (doc 02 §6.17): one expandable row per run, with the
 * steps inside. The color of a badge always comes with its word and icon.
 */
export function RunList({
  items,
  openIds,
  onToggle,
  revealId,
}: {
  items: RunItem[];
  openIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** The run that just finished: scrolled into view when it shows up. */
  revealId?: string | null;
}) {
  return (
    <section aria-labelledby="rotina-execucoes">
      <SectionHeader id="rotina-execucoes" title="Últimas execuções" />
      {items.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-6 text-center text-body text-fg-2 shadow-card">
          Nenhuma execução ainda. A primeira roda sozinha entre 6h e 7h de
          Brasília, ou use Rodar agora.
        </p>
      ) : (
        <ul className="@container overflow-hidden rounded-2xl bg-surface shadow-card [&>li+li]:border-t [&>li+li]:border-border">
          {items.map((item) => (
            <RunRow
              key={item.id}
              item={item}
              open={openIds.has(item.id)}
              onToggle={() => onToggle(item.id)}
              reveal={item.id === revealId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RunRow({
  item,
  open,
  onToggle,
  reveal,
}: {
  item: RunItem;
  open: boolean;
  onToggle: () => void;
  reveal: boolean;
}) {
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!reveal) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.current?.scrollIntoView({
      block: "center",
      behavior: calm ? "auto" : "smooth",
    });
  }, [reveal]);
  const { line } = item;
  const panelId = useId();
  const hasSteps = line.steps.length > 0;
  const caption = [line.origin, line.durationLabel].filter(Boolean).join(" · ");

  return (
    <li ref={row}>
      <button
        type="button"
        aria-expanded={hasSteps ? open : undefined}
        aria-controls={hasSteps ? panelId : undefined}
        disabled={!hasSteps}
        onClick={onToggle}
        className="flex min-h-16 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-left -outline-offset-2 transition-colors duration-100 enabled:hover:bg-surface-2/60 enabled:active:bg-surface-2"
      >
        <span className="flex min-w-0 flex-[1_1_10rem] flex-col">
          <span className="text-body font-semibold text-fg tabular-nums">
            {line.when}
          </span>
          <span className={cn("text-caption text-fg-3", CLAMP_TEXT)}>
            {caption}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <StatusBadge
            status={line.status}
            label={line.statusLabel}
            tone={line.tone}
          />
          {hasSteps ? (
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-5 text-fg-3 transition-transform duration-150",
                open && "rotate-180",
              )}
            />
          ) : null}
        </span>
      </button>
      {hasSteps && open ? (
        <ol
          id={panelId}
          className="flex flex-col gap-3 border-t border-border bg-surface-2/40 px-4 py-3"
        >
          {line.steps.map((step) => (
            <StepRow key={step.name} step={step} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function StepRow({ step }: { step: StepLine }) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 flex-[1_1_8rem] text-callout font-semibold text-fg">
          {step.label}
        </span>
        <StatusBadge
          status={step.status}
          label={step.statusLabel}
          tone={step.tone}
        />
        <span className="text-caption text-fg-3 tabular-nums">
          {step.durationLabel}
        </span>
      </div>
      {step.notes.length > 0 ? (
        <ul className="flex flex-col text-caption text-fg-2">
          {step.notes.map((note) => (
            <li key={note} className="break-words">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
      {step.error ? (
        <p className="text-caption text-fg-3">
          <span className="font-semibold">Detalhe técnico: </span>
          <code className="font-mono text-[0.75rem] break-words [overflow-wrap:anywhere]">
            {step.error}
          </code>
        </p>
      ) : null}
    </li>
  );
}
