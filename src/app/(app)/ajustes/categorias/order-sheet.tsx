"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "motion/react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/finance/category-icon";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { SheetContent } from "@/components/ui/sheet";
import { toastWithUndo } from "@/components/ui/toast";
import { categoryTree } from "@/lib/categories/hierarchy";
import {
  canMoveCategory,
  type MoveDirection,
  moveCategory,
} from "@/lib/categories/order";
import { cn } from "@/lib/utils";
import { reorderCategoriesAction } from "@/server/actions/categories";
import { orderPosition, orderSavedMessage, orderTitle } from "./messages";
import type { CategoryKind, ManagedCategory } from "./types";

/** The active categories of `kind` in the order they have now, as a tree. */
function activeTree(
  categories: readonly ManagedCategory[],
  kind: CategoryKind,
): ManagedCategory[] {
  return categoryTree(
    categories.filter((item) => item.kind === kind && !item.archived),
  );
}

/** Saves an order; shows what went wrong and resolves to false when it failed. */
async function persist(
  kind: CategoryKind,
  ids: string[],
): Promise<string | null> {
  try {
    const result = await reorderCategoriesAction({ kind, ids });
    return actionErrorMessage(result);
  } catch {
    return NETWORK_ERROR;
  }
}

/**
 * "Ordem das despesas" / "Ordem das receitas" (doc 02 §6.14, §5.14): the
 * categories as a tree with "Subir" / "Descer" (no dragging: buttons work by
 * touch, keyboard and screen reader alike). A main category moves with its
 * subcategories; a subcategory only among those of its own. Edits stay here
 * until "Salvar ordem", which can be undone.
 */
export function OrderSheet({
  kind,
  categories,
  onDone,
}: {
  kind: CategoryKind;
  categories: ManagedCategory[];
  onDone: () => void;
}) {
  const ids = useId();
  const initial = activeTree(categories, kind);
  const [draft, setDraft] = useState<readonly ManagedCategory[]>(initial);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  // The row just moved slides over its neighbours, never under them.
  const [lastMoved, setLastMoved] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // The moved row changes place in the DOM: the focus goes back to the button
  // that moved it, even when it now sits at an end (aria-disabled).
  const refocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!refocus.current) return;
    buttons.current.get(refocus.current)?.focus();
    refocus.current = null;
  });

  const names = new Map(categories.map((item) => [item.id, item.name]));

  function announce(list: readonly ManagedCategory[], id: string) {
    const item = list.find((category) => category.id === id);
    if (!item) return "";
    const siblings = list.filter(
      (category) => category.parentId === item.parentId,
    );
    return orderPosition(
      item.name,
      siblings.indexOf(item) + 1,
      siblings.length,
      item.parentId ? (names.get(item.parentId) ?? null) : null,
    );
  }

  function move(id: string, direction: MoveDirection) {
    if (!canMoveCategory(draft, id, direction)) return;
    const next = moveCategory(draft, id, direction);
    refocus.current = `${id}:${direction}`;
    setLastMoved(id);
    setDraft(next);
    setStatus(announce(next, id));
  }

  async function save() {
    setSaving(true);
    setError(undefined);
    const failure = await persist(
      kind,
      draft.map((item) => item.id),
    );
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    onDone();
    toastWithUndo(orderSavedMessage(kind), () => {
      void persist(
        kind,
        initial.map((item) => item.id),
      ).then((undoFailure) => {
        if (undoFailure) toast(undoFailure);
      });
    });
  }

  return (
    <SheetContent
      flowFooter
      title={orderTitle(kind)}
      description="Vale nas listas de categorias, nos orçamentos e no extrato. Os atalhos da nova transação continuam pelos mais usados."
      footer={
        <Button
          size="lg"
          className="w-full"
          aria-busy={saving || undefined}
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Salvando…" : "Salvar ordem"}
        </Button>
      }
    >
      <ol className="overflow-hidden rounded-2xl border border-border">
        {draft.map((category, index) => (
          <motion.li
            key={category.id}
            layout="position"
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            data-category={category.id}
            className={cn(
              "relative flex items-center gap-2 bg-surface pr-3 pl-1",
              category.id === lastMoved && "z-10",
              index > 0 && "border-t border-border",
              category.parentId && "pl-8",
            )}
          >
            <span className="flex shrink-0 flex-col">
              {(["up", "down"] as const).map((direction) => (
                <button
                  key={direction}
                  ref={(node) => {
                    const key = `${category.id}:${direction}`;
                    if (node) buttons.current.set(key, node);
                    else buttons.current.delete(key);
                  }}
                  type="button"
                  aria-label={`${direction === "up" ? "Subir" : "Descer"} ${category.name}`}
                  aria-disabled={
                    canMoveCategory(draft, category.id, direction)
                      ? undefined
                      : true
                  }
                  onClick={() => move(category.id, direction)}
                  className="inline-flex size-11 items-center justify-center rounded-full text-fg-2 transition-[background-color,scale] duration-100 ease-standard hover:bg-surface-2 active:scale-94 active:bg-surface-3 aria-disabled:cursor-default aria-disabled:text-fg-3/50 aria-disabled:hover:bg-transparent aria-disabled:active:scale-100 aria-disabled:active:bg-transparent [&_svg]:size-5"
                >
                  {direction === "up" ? (
                    <ChevronUp aria-hidden="true" />
                  ) : (
                    <ChevronDown aria-hidden="true" />
                  )}
                </button>
              ))}
            </span>
            <CategoryIcon icon={category.icon} color={category.color} />
            <span className="flex min-w-0 flex-[1_1_8rem] flex-col py-2">
              <span className="text-body font-semibold text-pretty break-words text-fg">
                {category.name}
              </span>
              {category.parentId ? (
                <span className="text-caption text-fg-3">
                  em {names.get(category.parentId) ?? "outra categoria"}
                </span>
              ) : null}
            </span>
          </motion.li>
        ))}
      </ol>
      <output className="sr-only">{status}</output>
      <FieldError id={`${ids}-error`} className="mt-3">
        {error}
      </FieldError>
    </SheetContent>
  );
}
