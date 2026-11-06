"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { afterSheetsClose } from "@/components/ui/use-back-to-close";
import { cn } from "@/lib/utils";
import { categoryTree, type KindParam } from "./statement-params";
import { useStatementFilters } from "./use-statement-filters";

export type FilterAccount = {
  id: string;
  name: string;
  icon: string;
  color: string;
  typeLabel: string;
  archived: boolean;
};

export type FilterCategory = {
  id: string;
  kind: "income" | "expense";
  name: string;
  icon: string;
  color: string;
  parentId: string | null;
};

const KIND_OPTIONS: { value: KindParam; label: string }[] = [
  { value: "despesa", label: "Despesas" },
  { value: "receita", label: "Receitas" },
  { value: "transferencia", label: "Transferências" },
];

type SheetName = "conta" | "categoria" | "tipo";
type FilterPatch = {
  conta?: string | null;
  categoria?: string | null;
  tipo?: KindParam | null;
};

/**
 * Filter chips of the statement (doc 02 §5.12, §6.4): Conta, Categoria, Tipo
 * and Pendentes in a row that scrolls sideways. An active chip turns
 * --primary-soft with its own "×"; each list opens in a choice sheet.
 */
export function StatementFilterBar({
  accounts,
  categories,
}: {
  accounts: FilterAccount[];
  categories: FilterCategory[];
}) {
  const { filters, setFilters, isPending } = useStatementFilters();
  const [sheet, setSheet] = useState<SheetName | null>(null);

  // The server ignores ids that are not the person's own (or malformed), so
  // a chip is on only for a value found in its list.
  const account = accounts.find(
    (item) => item.id === filters.conta?.toLowerCase(),
  );
  const category = categories.find(
    (item) => item.id === filters.categoria?.toLowerCase(),
  );
  const kind = KIND_OPTIONS.find((item) => item.value === filters.tipo);
  const anyActive = Boolean(account || category || kind || filters.status);

  // Each list has a sheet of its own, and a sheet closes only itself: a tap
  // on the next chip while the previous sheet still slides out reaches that
  // sheet as a tap outside (on touch, Radix acts on the click that follows),
  // which would close the new one if they shared a Dialog.
  function close(name: SheetName) {
    setSheet((current) => (current === name ? null : current));
  }

  // A choice closes the sheet first and changes the URL once the sheet's
  // history entry is gone: pushed earlier, the sheet's step back would undo
  // it (useBackToClose). Choosing what is already on only closes the sheet:
  // nuqs would push the same URL again, and Back would seem to do nothing.
  const chosen = useRef<FilterPatch | null>(null);
  function choose(patch: FilterPatch) {
    const keys = Object.keys(patch) as (keyof FilterPatch)[];
    if (keys.some((key) => patch[key] !== filters[key])) {
      chosen.current = patch;
    }
    setSheet(null);
  }
  useEffect(() => {
    const patch = chosen.current;
    if (sheet !== null || patch === null) return;
    chosen.current = null;
    afterSheetsClose(() => void setFilters(patch));
  }, [sheet, setFilters]);

  // The chips scroll sideways; "Limpar" stays outside the scroller, at the
  // end of the row, so it is always on screen (the fade before it says that
  // more chips are hidden).
  return (
    <fieldset
      data-pending={isPending ? "" : undefined}
      className="-mx-gutter flex min-w-0 items-center"
    >
      <legend className="sr-only">Filtros</legend>
      <div
        className={cn(
          "relative flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto scroll-px-gutter py-1 pl-gutter scrollbar-none mask-[linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1rem),transparent)] *:snap-start [&::-webkit-scrollbar]:hidden",
          anyActive ? "pr-4" : "pr-gutter",
        )}
      >
        <FilterChip
          label="Conta"
          value={account?.name ?? null}
          placeholder="Contas"
          onOpen={() => setSheet("conta")}
          onClear={() => void setFilters({ conta: null })}
        />
        <FilterChip
          label="Categoria"
          value={category?.name ?? null}
          placeholder="Categorias"
          onOpen={() => setSheet("categoria")}
          onClear={() => void setFilters({ categoria: null })}
        />
        <FilterChip
          label="Tipo"
          value={kind?.label ?? null}
          placeholder="Tipo"
          onOpen={() => setSheet("tipo")}
          onClear={() => void setFilters({ tipo: null })}
        />
        <ToggleChip
          pressed={filters.status === "pendente"}
          onClick={() =>
            void setFilters({
              status: filters.status === "pendente" ? null : "pendente",
            })
          }
        >
          Pendentes
        </ToggleChip>
        {filters.status === "pago" ? (
          <ToggleChip pressed onClick={() => void setFilters({ status: null })}>
            Pagos
          </ToggleChip>
        ) : null}
      </div>
      {anyActive ? (
        <button
          type="button"
          onClick={() => {
            void setFilters({
              conta: null,
              categoria: null,
              tipo: null,
              status: null,
            });
            focusFirstFilterChip();
          }}
          className="mr-[calc(var(--spacing-gutter)-0.75rem)] inline-flex h-9 shrink-0 items-center rounded-full px-3 text-callout font-bold text-primary hover:bg-primary-soft/60"
        >
          Limpar
        </button>
      ) : null}

      <ChoiceSheet
        title="Filtrar por conta"
        open={sheet === "conta"}
        onClose={() => close("conta")}
      >
        <OptionList
          selected={account?.id ?? null}
          allLabel="Todas as contas"
          onSelect={(id) => choose({ conta: id })}
          groups={[
            {
              title: null,
              options: accounts.map((item) => ({
                id: item.id,
                label: item.name,
                detail: item.archived
                  ? `${item.typeLabel} · arquivada`
                  : item.typeLabel,
                icon: (
                  <CategoryIcon
                    icon={item.icon}
                    color={item.color}
                    shape="square"
                    size="sm"
                    className="rounded-chip"
                  />
                ),
              })),
            },
          ]}
        />
      </ChoiceSheet>
      <ChoiceSheet
        title="Filtrar por categoria"
        open={sheet === "categoria"}
        onClose={() => close("categoria")}
      >
        <OptionList
          selected={category?.id ?? null}
          allLabel="Todas as categorias"
          onSelect={(id) => choose({ categoria: id })}
          groups={(["expense", "income"] as const).map((group) => ({
            title: group === "expense" ? "Despesas" : "Receitas",
            options: categoryTree(categories)
              .filter((item) => item.kind === group)
              .map((item) => ({
                id: item.id,
                label: categoryLabel(item, categories),
                detail: null,
                icon: (
                  <CategoryIcon icon={item.icon} color={item.color} size="sm" />
                ),
              })),
          }))}
        />
      </ChoiceSheet>
      <ChoiceSheet
        title="Filtrar por tipo"
        open={sheet === "tipo"}
        onClose={() => close("tipo")}
      >
        <OptionList
          selected={kind?.value ?? null}
          allLabel="Todos os tipos"
          onSelect={(value) =>
            choose({
              tipo:
                KIND_OPTIONS.find((item) => item.value === value)?.value ??
                null,
            })
          }
          groups={[
            {
              title: null,
              options: KIND_OPTIONS.map((item) => ({
                id: item.value,
                label: item.label,
                detail: null,
                icon: null,
              })),
            },
          ]}
        />
      </ChoiceSheet>
    </fieldset>
  );
}

function ChoiceSheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent title={title}>{children}</SheetContent>
    </Sheet>
  );
}

function FilterChip({
  label,
  value,
  placeholder,
  onOpen,
  onClear,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onOpen: () => void;
  onClear: () => void;
}) {
  const active = value !== null;
  const main = useRef<HTMLButtonElement>(null);
  return (
    <div
      className={cn(
        "inline-flex h-9 max-w-60 shrink-0 items-center rounded-full border text-callout font-semibold",
        active
          ? "border-transparent bg-primary-soft text-on-primary-soft"
          : "border-border bg-surface text-fg",
      )}
    >
      <button
        ref={main}
        type="button"
        aria-haspopup="dialog"
        data-filter-chip=""
        onClick={onOpen}
        className={cn(
          "relative inline-flex h-full min-w-0 items-center gap-1.5 rounded-full after:absolute after:inset-x-0 after:-inset-y-1",
          active ? "pr-1 pl-3.5" : "px-3.5",
        )}
      >
        <span className="sr-only">{label}: </span>
        <span className="truncate">{value ?? placeholder}</span>
        {active ? null : (
          <ChevronDown aria-hidden="true" className="size-4 text-fg-3" />
        )}
      </button>
      {active ? (
        <button
          type="button"
          aria-label={`Limpar filtro de ${label.toLowerCase()}`}
          onClick={() => {
            onClear();
            // The "×" leaves with the filter: the focus stays on the chip.
            focusWhenReady(() => main.current);
          }}
          className="relative mr-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-primary/10 after:absolute after:-inset-1"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Clearing a filter removes the button that had the focus, which would fall
 * to the body (WCAG 2.4.3, doc 02 §11): it moves to the first filter chip.
 */
export function focusFirstFilterChip() {
  focusWhenReady(() =>
    document.querySelector<HTMLElement>("[data-filter-chip]"),
  );
}

/** Focuses the element once it is in the DOM, trying for about a second. */
function focusWhenReady(find: () => HTMLElement | null, frames = 60) {
  const target = find();
  if (target?.isConnected) target.focus();
  else if (frames > 0) {
    requestAnimationFrame(() => focusWhenReady(find, frames - 1));
  }
}

function ToggleChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-callout font-semibold after:absolute after:inset-x-0 after:-inset-y-1",
        pressed
          ? "border-transparent bg-primary-soft text-on-primary-soft"
          : "border-border bg-surface text-fg hover:bg-surface-2",
      )}
    >
      {children}
      {pressed ? <X aria-hidden="true" className="size-4" /> : null}
    </button>
  );
}

type Option = {
  id: string;
  label: string;
  detail: string | null;
  icon: ReactNode;
};

function OptionList({
  groups,
  selected,
  allLabel,
  onSelect,
}: {
  groups: { title: string | null; options: Option[] }[];
  selected: string | null;
  allLabel: string;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="-mx-2 flex flex-col gap-3">
      <OptionButton
        label={allLabel}
        selected={selected === null}
        onClick={() => onSelect(null)}
      />
      {groups.map((group) =>
        group.options.length === 0 ? null : (
          <div key={group.title ?? "all"} className="flex flex-col">
            {group.title ? (
              <h3 className="px-2 pb-1 text-overline text-fg-3 uppercase">
                {group.title}
              </h3>
            ) : null}
            <ul className="flex flex-col">
              {group.options.map((option) => (
                <li key={option.id}>
                  <OptionButton
                    label={option.label}
                    detail={option.detail}
                    icon={option.icon}
                    selected={option.id === selected}
                    onClick={() => onSelect(option.id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}

function OptionButton({
  label,
  detail,
  icon,
  selected,
  onClick,
}: {
  label: string;
  detail?: string | null;
  icon?: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-control px-2 py-1.5 text-left transition-colors duration-100",
        selected ? "bg-primary-soft" : "hover:bg-surface-2 active:bg-surface-3",
      )}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-body font-semibold",
            selected ? "text-on-primary-soft" : "text-fg",
          )}
        >
          {label}
        </span>
        {detail ? (
          <span className="truncate text-caption text-fg-3">{detail}</span>
        ) : null}
      </span>
      {selected ? (
        <Check
          aria-hidden="true"
          className="size-5 shrink-0 text-primary"
          strokeWidth={2.25}
        />
      ) : null}
    </button>
  );
}

/** A subcategory reads "Parent › Child", as in the category picker. */
function categoryLabel(
  category: FilterCategory,
  categories: FilterCategory[],
): string {
  const parent = category.parentId
    ? categories.find((item) => item.id === category.parentId)
    : null;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}
