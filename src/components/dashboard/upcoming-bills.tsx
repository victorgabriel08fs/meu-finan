"use client";

import { CalendarCheck, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/finance/category-icon";
import { Money } from "@/components/money/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toastWithUndo } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { setPaidAction } from "@/server/actions/transactions";
import type { UpcomingItem } from "@/server/domain/dashboard";
import { type DueTone, dueLabel } from "./labels";

const DUE_TONE: Record<DueTone, string> = {
  danger: "font-semibold text-danger",
  warning: "font-semibold text-warning",
  neutral: "text-fg-3",
};

/** At most this many rows; the rest is one tap away in the statement. */
const MAX_ROWS = 6;

type UpcomingBillsProps = {
  items: UpcomingItem[];
  /** Today, `YYYY-MM-DD`, in the user's time zone. */
  today: string;
};

/**
 * "Próximas contas" (doc 02 §6.3): pending bills of the next 7 days and
 * invoices, overdue ones first in red. "Pagar" marks a bill as paid with a
 * "Desfazer" toast; an invoice opens its card.
 */
export function UpcomingBills({ items, today }: UpcomingBillsProps) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());

  const visible = items
    .filter((item) => !hidden.has(item.id))
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) || a.dueOn.localeCompare(b.dueOn),
    )
    .slice(0, MAX_ROWS);

  const toggle = (set: typeof setHidden, id: string, on: boolean) =>
    set((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const setHiddenId = (id: string, on: boolean) => toggle(setHidden, id, on);

  async function undo(item: UpcomingItem) {
    const result = await setPaidAction({ id: item.id, paid: false });
    if (!result || result.serverError || result.validationErrors) {
      toast.error(
        result?.serverError ?? "Não deu para desfazer. Tente de novo.",
      );
      return;
    }
    setHiddenId(item.id, false);
  }

  async function pay(item: UpcomingItem) {
    toggle(setBusy, item.id, true);
    const result = await setPaidAction({ id: item.id, paid: true });
    toggle(setBusy, item.id, false);
    if (!result || result.serverError || result.validationErrors) {
      toast.error(
        result?.serverError ?? "Não deu para marcar como pago. Tente de novo.",
      );
      return;
    }
    setHiddenId(item.id, true);
    toastWithUndo(`${item.title} marcado como pago`, () => {
      void undo(item);
    });
  }

  if (visible.length === 0) {
    return (
      <Card className="flex items-center gap-3 py-3.5">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft"
        >
          <CalendarCheck className="size-5" />
        </span>
        <p className="text-callout text-fg-2">
          Nada vencendo nos próximos 7 dias.
        </p>
      </Card>
    );
  }

  return (
    <Card className="px-4 py-1">
      <ul className="[&>li+li]:border-t [&>li+li]:border-border">
        {visible.map((item) => {
          const due = dueLabel(item.dueOn, today);
          const tone = item.overdue ? "danger" : due.tone;
          const subtitle =
            tone === "neutral" && item.type === "transaction"
              ? `${due.text} · ${item.accountName}`
              : due.text;

          if (item.type === "invoice") {
            return (
              <li key={`invoice-${item.id}`}>
                <Link
                  href={`/cartoes/${item.accountId}`}
                  className="-mx-4 flex min-h-17 items-center gap-3 px-4 py-2 transition-colors duration-100 hover:bg-surface-2/50 active:bg-surface-2"
                >
                  <CategoryIcon icon="credit-card" color={item.color} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-semibold text-fg">
                      {item.title}
                    </span>
                    <span
                      className={cn("truncate text-caption", DUE_TONE[tone])}
                    >
                      {subtitle}
                    </span>
                  </span>
                  <Money
                    cents={item.amountCents}
                    variant="headline"
                    tone="neutral"
                    className="font-bold"
                  />
                  <ChevronRight
                    aria-hidden="true"
                    className="-mr-1 size-5 shrink-0 text-fg-3"
                  />
                </Link>
              </li>
            );
          }

          return (
            <li
              key={`bill-${item.id}`}
              className="flex min-h-18 items-center gap-3 py-2"
            >
              <CategoryIcon icon={item.icon} color={item.color} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-semibold text-fg">
                  {item.title}
                </span>
                <span className={cn("truncate text-caption", DUE_TONE[tone])}>
                  {subtitle}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Money
                  cents={item.amountCents}
                  variant="headline"
                  tone="neutral"
                  className="font-bold"
                />
                <Button
                  variant="tonal"
                  size="sm"
                  aria-label={`Pagar ${item.title}`}
                  loading={busy.has(item.id)}
                  onClick={() => pay(item)}
                  className="px-3 font-bold"
                >
                  Pagar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
