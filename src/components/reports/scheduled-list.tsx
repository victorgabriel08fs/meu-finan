import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/money/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { shortDateLabel } from "@/lib/format/date";
import type { CashFlowScheduledItem } from "@/server/domain/reports";

const LIMIT = 6;

type ScheduledListProps = {
  items: CashFlowScheduledItem[];
  /** "31/out": the end of the projection. */
  endLabel: string;
  /** The statement filtered to pending entries of the month. */
  statementHref: string;
};

/**
 * "Agendados até 31/out" (doc 02 §6.12, Fluxo de caixa): what moves the
 * dashed line, soonest first — scheduled entries and the card invoices due,
 * overdue ones flagged — with the rest in the statement.
 */
export function ScheduledList({
  items,
  endLabel,
  statementHref,
}: ScheduledListProps) {
  const shown = items.slice(0, LIMIT);
  return (
    <Card asChild className="flex flex-col gap-1">
      <section aria-labelledby="relatorio-agendados">
        <h2 id="relatorio-agendados" className="text-headline text-fg">
          Agendados até {endLabel}
        </h2>
        <p className="text-caption text-fg-3">O que entra na previsão</p>
        {items.length === 0 ? (
          <p className="py-3 text-callout text-fg-2">
            Nada agendado: a previsão segue o saldo de hoje.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col [&>li+li]:border-t [&>li+li]:border-border">
            {shown.map((item) => (
              <li
                key={`${item.date}-${item.kind}-${item.label}-${item.amountCents}`}
                className="flex min-h-12 items-center gap-3 py-2"
              >
                <span className="w-12 shrink-0 text-caption font-semibold text-fg-3 tabular-nums">
                  {shortDateLabel(item.date)}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-callout font-semibold text-fg">
                    {item.label}
                  </span>
                  {item.overdue ? (
                    <Badge tone="danger" className="h-5 text-micro">
                      Atrasado
                    </Badge>
                  ) : null}
                </span>
                <Money cents={item.amountCents} variant="callout" />
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="secondary" className="mt-2">
          <Link href={statementHref}>
            {items.length > LIMIT
              ? `Ver os ${items.length} agendados no extrato`
              : "Ver agendados no extrato"}
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      </section>
    </Card>
  );
}
