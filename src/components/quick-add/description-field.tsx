"use client";

import { Pencil } from "lucide-react";
import {
  type KeyboardEvent,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { cn } from "@/lib/utils";
import { suggestionsAction } from "@/server/actions/transactions";
import type { EntryKind } from "@/stores/quick-add";
import type { QuickAddCategory } from "./types";

export type DescriptionSuggestion = {
  description: string;
  categoryId: string | null;
  accountId: string;
  /** Magnitude in cents. */
  amountCents: number;
};

const DEBOUNCE_MS = 150;

type DescriptionFieldProps = {
  kind: EntryKind;
  value: string;
  onChange: (value: string) => void;
  /** A suggestion was chosen: fill category, account and maybe the amount. */
  onPick: (suggestion: DescriptionSuggestion) => void;
  /** Enter with no suggestion highlighted. */
  onSubmit: () => void;
  /** Tells the sheet whether Esc should close the list instead of the sheet. */
  onListOpenChange: (open: boolean) => void;
  categories: QuickAddCategory[];
  ref?: Ref<HTMLInputElement>;
};

/**
 * Description with history autocomplete (doc 02 §6.5): typing asks
 * `suggestionsAction` (debounced 150ms) and lists past descriptions with their
 * category and amount. A combobox: arrows move, Enter picks, Esc closes.
 */
export function DescriptionField({
  kind,
  value,
  onChange,
  onPick,
  onSubmit,
  onListOpenChange,
  categories,
  ref,
}: DescriptionFieldProps) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<DescriptionSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<number | null>(null);
  const request = useRef(0);
  const byId = new Map(categories.map((category) => [category.id, category]));
  const canSuggest = kind !== "transfer";

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function setListOpen(next: boolean) {
    setOpen(next);
    onListOpenChange(next);
    if (!next) setActive(-1);
  }

  async function fetchSuggestions(
    suggestionKind: "expense" | "income",
    q: string,
    id: number,
  ) {
    try {
      const result = await suggestionsAction({ kind: suggestionKind, q });
      if (id !== request.current) return;
      const list = result?.data ?? [];
      setSuggestions(list);
      setActive(-1);
      setListOpen(list.length > 0);
    } catch {
      // Autocomplete is a convenience: stay quiet when offline.
    }
  }

  function handleChange(next: string) {
    onChange(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    const q = next.trim().slice(0, 60);
    request.current += 1;
    if (!canSuggest || q === "") {
      setListOpen(false);
      return;
    }
    const id = request.current;
    const suggestionKind = kind === "income" ? "income" : "expense";
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void fetchSuggestions(suggestionKind, q, id);
    }, DEBOUNCE_MS);
  }

  function pick(suggestion: DescriptionSuggestion) {
    request.current += 1;
    setListOpen(false);
    onPick(suggestion);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      if (!open) setListOpen(true);
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && open) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = open && active >= 0 ? suggestions[active] : undefined;
      if (chosen) pick(chosen);
      else {
        setListOpen(false);
        onSubmit();
      }
    } else if (event.key === "Escape" && open) {
      setListOpen(false);
    }
  }

  const showList = open && canSuggest && suggestions.length > 0;

  return (
    <div>
      <label
        className={cn(
          "flex h-12 items-center gap-2.5 rounded-control border border-border-strong bg-surface px-3.5",
          "focus-within:border-primary focus-within:shadow-[inset_0_0_0_1px_var(--primary)]",
        )}
      >
        <Pencil aria-hidden="true" className="size-4.5 shrink-0 text-fg-3" />
        <span className="sr-only">Descrição</span>
        <input
          ref={ref}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={
            showList && active >= 0 ? `${listId}-${active}` : undefined
          }
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setListOpen(false)}
          placeholder="Descrição (opcional)"
          maxLength={120}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          className="h-11 min-w-0 flex-1 bg-transparent text-input text-fg outline-none placeholder:text-fg-3"
        />
      </label>
      {showList ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Sugestões"
          className="mt-1.5 overflow-hidden rounded-control border border-border bg-surface shadow-card"
        >
          {suggestions.map((suggestion, index) => {
            const category = suggestion.categoryId
              ? byId.get(suggestion.categoryId)
              : undefined;
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: options are chosen with the combobox's arrow keys and Enter
              <div
                key={`${suggestion.description}-${index}`}
                id={`${listId}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === active}
                // Keeps the focus (and the keyboard) in the input.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(suggestion)}
                className={cn(
                  "flex min-h-13 cursor-pointer items-center gap-3 px-3 py-2",
                  index > 0 && "border-t border-border",
                  index === active ? "bg-surface-2" : "hover:bg-surface-2",
                )}
              >
                <CategoryIcon
                  icon={category?.icon ?? "ellipsis"}
                  color={category?.color ?? "neutral"}
                  size="sm"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-callout font-semibold text-fg">
                    {suggestion.description}
                  </span>
                  <span className="truncate text-caption text-fg-3">
                    {category?.name ?? "Sem categoria"}
                  </span>
                </span>
                <Money
                  cents={suggestion.amountCents}
                  variant="callout"
                  tone="neutral"
                  sign="never"
                  className="shrink-0 text-fg-2"
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
