"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { KindParam } from "./statement-params";
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
  const [lastSheet, setLastSheet] = useState<SheetName>("conta");

  const account = accounts.find((item) => item.id === filters.conta);
  const category = categories.find((item) => item.id === filters.categoria);
  const kind = KIND_OPTIONS.find((item) => item.value === filters.tipo);
  const anyActive = Boolean(
    filters.conta || filters.categoria || filters.tipo || filters.status,
  );

  function open(name: SheetName) {
    setLastSheet(name);
    setSheet(name);
  }

  function choose(patch: Parameters<typeof setFilters>[0]) {
    void setFilters(patch);
    setSheet(null);
  }

  return (
    <fieldset
      data-pending={isPending ? "" : undefined}
      className="-mx-gutter flex min-w-0 snap-x gap-2 overflow-x-auto scroll-px-gutter px-gutter py-1 scrollbar-none mask-[linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1rem),transparent)] [&::-webkit-scrollbar]:hidden [&>:not(legend)]:snap-start"
    >
      <legend className="sr-only">Filtros</legend>
      <FilterChip
        label="Conta"
        value={filters.conta ? (account?.name ?? "Conta") : null}
        placeholder="Contas"
        onOpen={() => open("conta")}
        onClear={() => void setFilters({ conta: null })}
      />
      <FilterChip
        label="Categoria"
        value={filters.categoria ? (category?.name ?? "Categoria") : null}
        placeholder="Categorias"
        onOpen={() => open("categoria")}
        onClear={() => void setFilters({ categoria: null })}
      />
      <FilterChip
        label="Tipo"
        value={kind?.label ?? null}
        placeholder="Tipo"
        onOpen={() => open("tipo")}
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
      {anyActive ? (
        <button
          type="button"
          onClick={() =>
            void setFilters({
              conta: null,
              categoria: null,
              tipo: null,
              status: null,
            })
          }
          className="inline-flex h-9 shrink-0 items-center rounded-full px-3 text-callout font-bold text-primary hover:bg-primary-soft/60"
        >
          Limpar
        </button>
      ) : null}

      <Sheet
        open={sheet !== null}
        onOpenChange={(next) => {
          if (!next) setSheet(null);
        }}
      >
        <SheetContent
          title={
            lastSheet === "conta"
              ? "Filtrar por conta"
              : lastSheet === "categoria"
                ? "Filtrar por categoria"
                : "Filtrar por tipo"
          }
        >
          {lastSheet === "conta" ? (
            <OptionList
              selected={filters.conta}
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
          ) : lastSheet === "categoria" ? (
            <OptionList
              selected={filters.categoria}
              allLabel="Todas as categorias"
              onSelect={(id) => choose({ categoria: id })}
              groups={(["expense", "income"] as const).map((group) => ({
                title: group === "expense" ? "Despesas" : "Receitas",
                options: categories
                  .filter((item) => item.kind === group)
                  .map((item) => ({
                    id: item.id,
                    label: item.name,
                    detail: null,
                    icon: (
                      <CategoryIcon
                        icon={item.icon}
                        color={item.color}
                        size="sm"
                      />
                    ),
                  })),
              }))}
            />
          ) : (
            <OptionList
              selected={filters.tipo}
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
          )}
        </SheetContent>
      </Sheet>
    </fieldset>
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
        type="button"
        aria-haspopup="dialog"
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
          onClick={onClear}
          className="relative mr-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-primary/10 after:absolute after:-inset-1"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
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
