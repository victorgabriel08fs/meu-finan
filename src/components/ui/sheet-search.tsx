"use client";

import { Search } from "lucide-react";

/** Choice sheets get a search field past this many options (§4.4). */
export const SHEET_SEARCH_THRESHOLD = 8;

/**
 * Search field of a choice sheet with more than 8 options (doc 02 §4.4): it
 * sticks to the top of the sheet's body while the list scrolls under it. The
 * body goes without its top padding (`bodyClassName="pt-0"`), which the field
 * brings itself. No autofocus: on phones the keyboard would cover the list.
 */
export function SheetSearch({
  label,
  value,
  onChange,
}: {
  /** "Buscar categoria": the accessible name and the placeholder. */
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="sticky top-0 z-1 -mx-5 mb-3 flex bg-surface px-5 pt-2 pb-2">
      <span className="sr-only">{label}</span>
      <span className="relative flex w-full items-center">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 size-4.5 text-fg-3"
        />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={label}
          enterKeyHint="search"
          autoComplete="off"
          className="h-11 w-full rounded-control border border-border-strong bg-surface pr-3 pl-10 text-input text-fg outline-none placeholder:text-fg-3 focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]"
        />
      </span>
    </label>
  );
}
