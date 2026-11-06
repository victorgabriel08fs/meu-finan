"use client";

import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  LayoutDashboard,
  Lock,
  SlidersHorizontal,
} from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/app/section-header";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toastWithUndo } from "@/components/ui/toast";
import {
  HOME_BLOCKS,
  type HomeBlockDefinition,
  type HomeBlockId,
} from "@/lib/home/blocks";
import {
  canMoveHomeBlock,
  type HomeLayoutEntry,
  moveHomeBlock,
  type StoredHomeBlock,
  setHomeBlockVisible,
  toStoredLayout,
} from "@/lib/home/layout";
import { cn } from "@/lib/utils";
import { saveHomeLayoutAction } from "@/server/actions/preferences";

type Direction = "up" | "down";

type HomeLayoutProps = {
  /** The person's Início: every block, the Saldo first (getHomeLayout). */
  entries: HomeLayoutEntry[];
  /** They saved a choice of their own (false: the app's default). */
  customized: boolean;
};

/** A client older than the catalog sent a block the server does not know. */
const STALE = "Não conseguimos salvar. Atualize a página e tente de novo.";

/** "Receitas e despesas na posição 3 de 8." */
export function positionAnnouncement(
  entries: readonly HomeLayoutEntry[],
  id: HomeBlockId,
): string {
  const index = entries.findIndex((entry) => entry.id === id);
  return `${HOME_BLOCKS[id].label} na posição ${index + 1} de ${entries.length}.`;
}

/**
 * Caption of the Preferências row. No count of blocks: some render nothing
 * in a given month (the Destaque), so a number would not match the Início.
 */
export function homeLayoutSummary({ customized }: HomeLayoutProps): string {
  return customized ? "Na sua ordem" : "Padrão do app";
}

/**
 * Saves the blocks (null: the default). Shows what went wrong and resolves
 * to false when nothing was saved.
 */
export async function persistHomeLayout(
  blocks: StoredHomeBlock[] | null,
): Promise<boolean> {
  try {
    const result = await saveHomeLayoutAction({ blocks });
    const message = result?.validationErrors
      ? STALE
      : actionErrorMessage(result);
    if (message) {
      toast(message);
      return false;
    }
    return true;
  } catch {
    toast(NETWORK_ERROR);
    return false;
  }
}

type HomeCustomizeSheetProps = HomeLayoutProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where it opened from: Preferências confirms with a way to the Início. */
  from: "inicio" | "preferencias";
};

/**
 * "Personalizar o Início" (doc 02 §6.3, §5.14): every block with a switch to
 * show it and "Subir" / "Descer" to order it (no dragging: buttons work by
 * touch, keyboard and screen reader alike); the Saldo stays first. Edits
 * stay here until "Salvar"; "Restaurar padrão" saves at once, with an undo.
 */
export function HomeCustomizeSheet({
  entries,
  customized,
  open,
  onOpenChange,
  from,
}: HomeCustomizeSheetProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(entries);
  const [busy, setBusy] = useState<"save" | "restore" | null>(null);
  // Every opening starts from what is saved.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(entries);
  }

  async function save() {
    setBusy("save");
    const saved = await persistHomeLayout(toStoredLayout(draft));
    setBusy(null);
    if (!saved) return;
    onOpenChange(false);
    if (from === "preferencias") {
      toast("Início atualizado.", {
        action: { label: "Ver Início", onClick: () => router.push("/inicio") },
      });
    }
  }

  async function restore() {
    const previous = toStoredLayout(entries);
    setBusy("restore");
    const saved = await persistHomeLayout(null);
    setBusy(null);
    if (!saved) return;
    onOpenChange(false);
    toastWithUndo("O Início voltou ao padrão.", () => {
      void persistHomeLayout(previous);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Personalizar o Início"
        description="Escolha os blocos e a ordem. Vale em todos os seus aparelhos."
        footer={
          <Button
            size="lg"
            className="w-full"
            aria-busy={busy === "save" || undefined}
            disabled={busy !== null}
            onClick={() => void save()}
          >
            {busy === "save" ? "Salvando…" : "Salvar"}
          </Button>
        }
      >
        <HomeBlockList entries={draft} onChange={setDraft} />
        {customized ? (
          <Button
            variant="ghost"
            className="mt-3 -ml-3"
            aria-busy={busy === "restore" || undefined}
            disabled={busy !== null}
            onClick={() => void restore()}
          >
            Restaurar padrão
          </Button>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** The list of blocks being edited, with its moves and switches. */
export function HomeBlockList({
  entries,
  onChange,
}: {
  entries: HomeLayoutEntry[];
  onChange: (entries: HomeLayoutEntry[]) => void;
}) {
  const ids = useId();
  const [status, setStatus] = useState("");
  // The row just moved slides over its neighbours, never under them.
  const [lastMoved, setLastMoved] = useState<HomeBlockId | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // The moved row changes place in the DOM: give the focus back to the
  // button that moved it, even when it now sits at an end (aria-disabled).
  const refocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!refocus.current) return;
    buttons.current.get(refocus.current)?.focus();
    refocus.current = null;
  });

  function move(id: HomeBlockId, direction: Direction) {
    if (!canMoveHomeBlock(entries, id, direction)) return;
    const next = moveHomeBlock(entries, id, direction);
    refocus.current = `${id}:${direction}`;
    setLastMoved(id);
    onChange(next);
    setStatus(positionAnnouncement(next, id));
  }

  return (
    <>
      <ol className="overflow-hidden rounded-2xl border border-border">
        {entries.map((entry, index) => {
          const block: HomeBlockDefinition = HOME_BLOCKS[entry.id];
          const name = `${ids}-${entry.id}-nome`;
          const description = `${ids}-${entry.id}-descricao`;
          const badge = `${ids}-${entry.id}-novo`;
          return (
            <motion.li
              key={entry.id}
              layout="position"
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              data-block={entry.id}
              className={cn(
                "relative flex flex-wrap items-center gap-x-2 bg-surface",
                entry.id === lastMoved && "z-10",
                index > 0 && "border-t border-border",
                block.pinned ? "min-h-16 py-2 pr-4 pl-4" : "min-h-22 pr-2 pl-1",
              )}
            >
              {block.pinned ? (
                <span
                  aria-hidden="true"
                  className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-4.5"
                >
                  <Lock />
                </span>
              ) : (
                <span className="flex shrink-0 flex-col">
                  {(["up", "down"] as const).map((direction) => {
                    const enabled = canMoveHomeBlock(
                      entries,
                      entry.id,
                      direction,
                    );
                    return (
                      <button
                        key={direction}
                        ref={(node) => {
                          const key = `${entry.id}:${direction}`;
                          if (node) buttons.current.set(key, node);
                          else buttons.current.delete(key);
                        }}
                        type="button"
                        aria-label={`${direction === "up" ? "Subir" : "Descer"} ${block.label}`}
                        aria-disabled={enabled ? undefined : true}
                        onClick={() => move(entry.id, direction)}
                        className="inline-flex size-11 items-center justify-center rounded-full text-fg-2 transition-[background-color,scale] duration-100 ease-standard hover:bg-surface-2 active:scale-94 active:bg-surface-3 aria-disabled:cursor-default aria-disabled:text-fg-3/50 aria-disabled:hover:bg-transparent aria-disabled:active:scale-100 aria-disabled:active:bg-transparent [&_svg]:size-5"
                      >
                        {direction === "up" ? (
                          <ChevronUp aria-hidden="true" />
                        ) : (
                          <ChevronDown aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </span>
              )}
              <span className="flex min-w-0 flex-[1_1_9rem] flex-col gap-0.5 py-2">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span id={name} className="text-body font-semibold text-fg">
                    {block.label}
                  </span>
                  {entry.isNew ? (
                    <Badge id={badge} tone="primary">
                      Novo
                    </Badge>
                  ) : null}
                </span>
                <span
                  id={description}
                  className="text-caption text-pretty text-fg-3"
                >
                  {block.pinned ? "Sempre no topo" : block.description}
                </span>
              </span>
              {block.pinned ? null : (
                <Switch
                  className="ml-auto"
                  checked={entry.visible}
                  onCheckedChange={(visible) =>
                    onChange(setHomeBlockVisible(entries, entry.id, visible))
                  }
                  labelledBy={name}
                  describedBy={
                    entry.isNew ? `${badge} ${description}` : description
                  }
                />
              )}
            </motion.li>
          );
        })}
      </ol>
      <output className="sr-only">{status}</output>
    </>
  );
}

/** "Personalizar o Início", at the end of the Início. */
export function HomeCustomizeButton(props: HomeLayoutProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        className="max-w-full"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal aria-hidden="true" />
        Personalizar o Início
      </Button>
      <HomeCustomizeSheet
        {...props}
        open={open}
        onOpenChange={setOpen}
        from="inicio"
      />
    </>
  );
}

/** Ajustes › Preferências › Início: the same sheet, from a row. */
export function HomeCustomizeRow(props: HomeLayoutProps) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="preferencias-inicio">
      <SectionHeader id="preferencias-inicio" title="Início" />
      <div
        data-tip="home-customize"
        className="overflow-hidden rounded-2xl bg-surface shadow-card"
      >
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left -outline-offset-2 transition-colors duration-100 hover:bg-surface-2/60 active:bg-surface-2"
        >
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 text-fg-2 [&_svg]:size-5"
          >
            <LayoutDashboard />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body font-semibold text-fg">
              Personalizar o Início
            </span>
            <span className="text-caption text-fg-3">
              {homeLayoutSummary(props)}
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="size-5 shrink-0 text-fg-3"
          />
        </button>
      </div>
      <HomeCustomizeSheet
        {...props}
        open={open}
        onOpenChange={setOpen}
        from="preferencias"
      />
    </section>
  );
}
