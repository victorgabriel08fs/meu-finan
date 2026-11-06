import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DataColumn = {
  key: string;
  header: ReactNode;
  align?: "start" | "end";
};

export type DataRow = {
  key: string;
  /** First cell, rendered as the row header. */
  header: ReactNode;
  cells: ReactNode[];
  /** Emphasise the last cell (e.g. the balance). */
  strongLast?: boolean;
};

type DataTableProps = {
  /** Read by screen readers as the table name. */
  caption: string;
  columns: DataColumn[];
  rows: DataRow[];
  /** Scroll inside with a sticky header (long tables such as "Ano a ano"). */
  maxHeightClassName?: string;
  /**
   * Name of the scrolling region ("Tabela do saldo dia a dia"); the caption
   * by default. Only with `maxHeightClassName`.
   */
  regionLabel?: string;
  className?: string;
};

/**
 * The table twin of a chart (doc 02 §9.5): same data, tabular figures,
 * overline headers, hairlines between rows.
 */
export function DataTable({
  caption,
  columns,
  rows,
  maxHeightClassName,
  regionLabel,
  className,
}: DataTableProps) {
  // A region that scrolls takes the focus, so the keyboard can scroll it too
  // (WCAG 2.1.1; axe scrollable-region-focusable).
  const scrolls = Boolean(maxHeightClassName);
  return (
    <div
      {...(scrolls
        ? {
            role: "region",
            tabIndex: 0,
            "aria-label": regionLabel ?? caption,
          }
        : {})}
      className={cn(
        scrolls &&
          "overflow-y-auto overscroll-contain rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        maxHeightClassName,
        className,
      )}
    >
      <table className="w-full border-collapse text-caption tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "sticky top-0 z-1 border-b border-border bg-surface py-2 text-overline uppercase text-fg-3",
                  column.align === "end" ? "text-right" : "text-left",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className="border-b border-border last:border-b-0"
            >
              <th
                scope="row"
                className="py-2 pr-2 text-left font-semibold break-words text-fg-2"
              >
                {row.header}
              </th>
              {row.cells.map((cell, index) => {
                const column = columns[index + 1];
                const strong = row.strongLast && index === row.cells.length - 1;
                return (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                    key={index}
                    className={cn(
                      "py-2 pl-2 whitespace-nowrap",
                      column?.align === "start" ? "text-left" : "text-right",
                      strong ? "font-bold text-fg" : "text-fg-2",
                    )}
                  >
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
