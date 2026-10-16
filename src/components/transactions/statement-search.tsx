"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { debounce, defaultRateLimit, parseAsString, useQueryState } from "nuqs";
import { useRef, useTransition } from "react";
import { cn } from "@/lib/utils";
import { MAX_QUERY_LENGTH } from "./statement-params";

/**
 * Statement search (doc 02 §6.4): updates `?q=` 300ms after the last key
 * (Enter right away); the server matches accents and typos. It lives outside
 * the list's <Suspense> so typing never loses the focus, and flags
 * `data-pending` while results load so the list dims instead of flashing.
 */
export function StatementSearch({ className }: { className?: string }) {
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({
      shallow: false,
      history: "replace",
      scroll: false,
      startTransition,
      limitUrlUpdates: debounce(300),
    }),
  );

  return (
    <search
      data-pending={isPending ? "" : undefined}
      className={cn("relative", className)}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void setQ(q.trim() || null, { limitUrlUpdates: defaultRateLimit });
          inputRef.current?.blur();
        }}
      >
        <label className="relative flex items-center">
          <span className="sr-only">Buscar lançamentos</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 size-5 text-fg-3"
          />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            maxLength={MAX_QUERY_LENGTH}
            placeholder="Buscar lançamentos"
            value={q}
            onChange={(event) => void setQ(event.target.value || null)}
            className={cn(
              "h-11 w-full rounded-control border border-border bg-surface pr-11 pl-11 text-input text-fg shadow-card outline-none placeholder:text-fg-3",
              "focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]",
              "[&::-webkit-search-cancel-button]:appearance-none",
            )}
          />
          {isPending ? (
            <LoaderCircle
              aria-hidden="true"
              className="pointer-events-none absolute right-3.5 size-5 animate-spin text-fg-3"
            />
          ) : q ? (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => {
                void setQ(null, { limitUrlUpdates: defaultRateLimit });
                inputRef.current?.focus();
              }}
              className="absolute right-0.5 inline-flex size-10 items-center justify-center rounded-full text-fg-3 hover:bg-surface-2 hover:text-fg-2"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          ) : null}
        </label>
      </form>
      <output aria-live="polite" className="sr-only">
        {isPending ? "Buscando…" : ""}
      </output>
    </search>
  );
}
