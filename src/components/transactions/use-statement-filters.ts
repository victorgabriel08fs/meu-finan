"use client";

import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useTransition } from "react";
import { KIND_PARAMS, STATUS_PARAMS } from "./statement-params";

/**
 * The statement filters in the URL (nuqs, doc 02 §4.1). Updates are real
 * navigations (`shallow: false`) so the server re-renders the list, run in a
 * transition so the old list stays on screen (dimmed through `data-pending`)
 * until the new one arrives, and are pushed to history: Back undoes a filter.
 */
export function useStatementFilters() {
  const [isPending, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(
    {
      conta: parseAsString,
      categoria: parseAsString,
      tipo: parseAsStringLiteral(KIND_PARAMS),
      status: parseAsStringLiteral(STATUS_PARAMS),
      q: parseAsString.withDefault(""),
    },
    { shallow: false, history: "push", scroll: false, startTransition },
  );

  function clearAll() {
    void setFilters({
      conta: null,
      categoria: null,
      tipo: null,
      status: null,
      q: null,
    });
  }

  return { filters, setFilters, clearAll, isPending };
}
