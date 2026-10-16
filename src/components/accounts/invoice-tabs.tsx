"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { Money } from "@/components/money/money";
import type { InvoiceStatus } from "@/lib/finance/invoices";
import { cn } from "@/lib/utils";
import { INVOICE_STATUS } from "./invoice-meta";

export type InvoiceTab = {
  month: string;
  /** "out", "jan/27". */
  label: string;
  href: string;
  selected: boolean;
  status: InvoiceStatus;
  /** Invoices after the current one show their amount instead of a status. */
  future: boolean;
  totalCents: number;
};

/**
 * Invoice months (doc 02 §6.8): a scrollable row of 84×54 tabs with a status
 * dot (or the amount, for future invoices). The selected one is scrolled to
 * the centre on arrival. Plain links (`?fatura=YYYY-MM`), so back undoes.
 */
export function InvoiceTabs({ tabs }: { tabs: InvoiceTab[] }) {
  const listRef = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>("[aria-current]");
    if (!list || !selected) return;
    list.scrollLeft =
      selected.offsetLeft - (list.clientWidth - selected.offsetWidth) / 2;
  });

  return (
    <nav aria-label="Faturas" className="-mx-gutter md:mx-0">
      <ul
        ref={listRef}
        className="relative flex snap-x gap-2 overflow-x-auto scroll-px-gutter px-gutter py-1 scrollbar-none md:scroll-px-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const meta = INVOICE_STATUS[tab.status];
          return (
            <li key={tab.month} className="shrink-0 snap-start">
              <Link
                href={tab.href}
                scroll={false}
                aria-current={tab.selected ? "page" : undefined}
                className={cn(
                  "flex h-13.5 w-21 flex-col items-center justify-center gap-0.5 rounded-control border transition-[background-color,scale] duration-100 ease-standard active:scale-97 focus-visible:-outline-offset-2",
                  tab.selected
                    ? "border-2 border-primary bg-primary-soft"
                    : "border-border bg-surface hover:bg-surface-2/60",
                )}
              >
                <span
                  className={cn(
                    "text-callout font-bold",
                    tab.selected ? "text-on-primary-soft" : "text-fg",
                  )}
                >
                  {tab.label}
                </span>
                {tab.future ? (
                  <Money
                    cents={tab.totalCents}
                    variant="caption"
                    tone="neutral"
                    className="text-micro text-fg-3"
                  />
                ) : (
                  <span
                    className={cn(
                      "flex items-center gap-1 text-micro font-bold",
                      meta.text,
                    )}
                  >
                    {tab.status === "paid" ? (
                      <Check
                        aria-hidden="true"
                        className="size-3"
                        strokeWidth={3}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={cn("size-1.5 rounded-full", meta.dot)}
                      />
                    )}
                    {meta.label}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
