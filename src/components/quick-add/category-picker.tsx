"use client";

import { LayoutGrid } from "lucide-react";
import { useState } from "react";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  SHEET_SEARCH_THRESHOLD,
  SheetSearch,
} from "@/components/ui/sheet-search";
import { categoryLabel } from "@/lib/categories/hierarchy";
import { matchesSearch } from "@/lib/format/search";
import { cn } from "@/lib/utils";
import { ChoiceChip } from "./choice-chip";
import type { QuickAddCategory } from "./types";

/** Chips shown before "Todas" (doc 02 §6.5). */
const TOP_COUNT = 6;

type CategoryChipsProps = {
  /** Ordered by use in the last 90 days. */
  categories: QuickAddCategory[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  kindLabel: string;
};

/**
 * The 6 most used categories of the type as chips, plus "Todas" (a sheet with
 * a 4-column grid and search). A choice outside the top 6 shows up front so
 * the selection is always visible; tapping the selected chip clears it.
 */
export function CategoryChips({
  categories,
  selectedId,
  onSelect,
  kindLabel,
}: CategoryChipsProps) {
  const [allOpen, setAllOpen] = useState(false);
  const top = categories.slice(0, TOP_COUNT);
  const selected = categories.find((category) => category.id === selectedId);
  const chips =
    selected && !top.some((category) => category.id === selected.id)
      ? [selected, ...top.slice(0, TOP_COUNT - 1)]
      : top;

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Categoria de {kindLabel}</legend>
      <div className="relative -mx-5 flex snap-x gap-2 overflow-x-auto scroll-px-5 px-5 pb-1 scrollbar-none mask-[linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1rem),transparent)] *:snap-start [&::-webkit-scrollbar]:hidden">
        {chips.map((category) => {
          const isSelected = category.id === selectedId;
          return (
            <ChoiceChip
              key={category.id}
              selected={isSelected}
              aria-pressed={isSelected}
              iconCircle
              icon={
                <CategoryIcon
                  icon={category.icon}
                  color={category.color}
                  size="sm"
                />
              }
              onClick={() => onSelect(isSelected ? null : category.id)}
            >
              {category.name}
            </ChoiceChip>
          );
        })}
        <ChoiceChip
          aria-haspopup="dialog"
          icon={<LayoutGrid aria-hidden="true" className="size-4 text-fg-2" />}
          onClick={() => setAllOpen(true)}
        >
          Todas
        </ChoiceChip>
      </div>
      <CategorySheet
        open={allOpen}
        onOpenChange={setAllOpen}
        categories={categories}
        selectedId={selectedId}
        onSelect={(id) => {
          onSelect(id);
          setAllOpen(false);
        }}
      />
    </fieldset>
  );
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

function CategorySheet({
  open,
  onOpenChange,
  categories,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: QuickAddCategory[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const label = (category: QuickAddCategory) =>
    categoryLabel(category, categories);
  const sorted = [...categories].sort((a, b) =>
    collator.compare(label(a), label(b)),
  );
  const visible = sorted.filter((category) =>
    matchesSearch(label(category), query),
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <SheetContent title="Categorias" bodyClassName="pt-0">
        {categories.length > SHEET_SEARCH_THRESHOLD ? (
          <SheetSearch
            label="Buscar categoria"
            value={query}
            onChange={setQuery}
          />
        ) : null}
        {visible.length === 0 ? (
          <p className="py-8 text-center text-body text-fg-2">
            Nenhuma categoria com “{query.trim()}”.
          </p>
        ) : (
          <ul className="grid grid-cols-4 gap-x-1 gap-y-2 pb-2">
            {visible.map((category) => {
              const isSelected = category.id === selectedId;
              const parent = category.parentId
                ? categories.find((item) => item.id === category.parentId)
                : undefined;
              return (
                <li key={category.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={label(category)}
                    onClick={() => onSelect(category.id)}
                    className={cn(
                      "flex w-full flex-col items-center gap-1.5 rounded-control px-1 pt-2 pb-1.5 transition-colors duration-100",
                      isSelected
                        ? "bg-primary-soft text-on-primary-soft shadow-[inset_0_0_0_2px_var(--primary)]"
                        : "text-fg hover:bg-surface-2 active:bg-surface-3",
                    )}
                  >
                    <CategoryIcon
                      icon={category.icon}
                      color={category.color}
                      size="md"
                    />
                    {parent ? (
                      <span
                        aria-hidden="true"
                        className="flex min-h-9 w-full flex-col items-center"
                      >
                        <span className="w-full truncate text-center text-caption text-fg-2">
                          {parent.name}
                        </span>
                        <span className="line-clamp-1 w-full text-center text-caption font-semibold wrap-break-word">
                          {category.name}
                        </span>
                      </span>
                    ) : (
                      <span className="line-clamp-2 min-h-9 w-full text-center text-caption font-semibold wrap-break-word">
                        {category.name}
                      </span>
                    )}
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
