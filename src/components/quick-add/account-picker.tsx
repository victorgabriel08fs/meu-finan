"use client";

import { Check } from "lucide-react";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { QuickAddAccount } from "./types";

type AccountSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  accounts: QuickAddAccount[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Hidden from the list (the other side of a transfer). */
  excludeId?: string | null;
};

/** Account choice sheet (doc 02 §4.4): square icon, name and type per row. */
export function AccountSheet({
  open,
  onOpenChange,
  title,
  accounts,
  selectedId,
  onSelect,
  excludeId,
}: AccountSheetProps) {
  const options = accounts.filter((account) => account.id !== excludeId);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={title}>
        {options.length === 0 ? (
          <p className="py-8 text-center text-body text-fg-2">
            Nenhuma outra conta disponível.
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {options.map((account) => {
              const isSelected = account.id === selectedId;
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelect(account.id)}
                    className={cn(
                      "flex min-h-15 w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors duration-100",
                      isSelected
                        ? "bg-primary-soft"
                        : "hover:bg-surface-2 active:bg-surface-3",
                    )}
                  >
                    <CategoryIcon
                      icon={account.icon}
                      color={account.color}
                      shape="square"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          "truncate text-headline",
                          isSelected ? "text-on-primary-soft" : "text-fg",
                        )}
                      >
                        {account.name}
                      </span>
                      <span className="truncate text-caption text-fg-3">
                        {account.typeLabel}
                      </span>
                    </span>
                    {isSelected ? (
                      <Check
                        aria-hidden="true"
                        className="size-5 shrink-0 text-primary"
                        strokeWidth={2.25}
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
