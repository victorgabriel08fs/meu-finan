"use client";

import { Plus } from "lucide-react";
import { AddFab } from "@/components/app/add-fab";
import { Button, type ButtonProps } from "@/components/ui/button";
import { type EntryKind, useQuickAddStore } from "@/stores/quick-add";

/**
 * Triggers of the global "Nova transação" sheet. They only flip the store, so
 * they work from the first paint, before the sheet's data has streamed in.
 */

/** The "+" of the tab bar (doc 02 §4.2). */
export function QuickAddFab() {
  const openQuickAdd = useQuickAddStore((state) => state.openQuickAdd);
  return <AddFab aria-haspopup="dialog" onClick={() => openQuickAdd()} />;
}

/** "Nova transação" at the top of the desktop sidebar (§4.5). */
export function QuickAddSidebarButton() {
  const openQuickAdd = useQuickAddStore((state) => state.openQuickAdd);
  return (
    <Button
      className="w-full"
      aria-haspopup="dialog"
      onClick={() => openQuickAdd()}
    >
      <Plus aria-hidden="true" />
      Nova transação
    </Button>
  );
}

type QuickAddButtonProps = Omit<ButtonProps, "onClick" | "asChild"> & {
  /** Type the sheet opens in. */
  kind?: EntryKind;
};

/** Any other entry point, e.g. "Adicionar despesa" in an empty state. */
export function QuickAddButton({
  kind = "expense",
  ...props
}: QuickAddButtonProps) {
  const openQuickAdd = useQuickAddStore((state) => state.openQuickAdd);
  return (
    <Button
      aria-haspopup="dialog"
      {...props}
      onClick={() => openQuickAdd(kind)}
    />
  );
}
