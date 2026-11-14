import { Play } from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/money/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { closingHeadline } from "./closing-model";
import { KpiTile } from "./kpi-tile";

type ClosingSummaryCardProps = {
  /** "outubro". */
  monthName: string;
  /** "setembro". */
  previousMonthName: string;
  incomeCents: number;
  expenseCents: number;
  leftCents: number;
  /** The month before had something paid: its leftover, signed. */
  previousLeftCents: number | null;
  hasPending: boolean;
  /** The statement of the month's pending entries. */
  pendingHref: string;
  /** The Retrospectiva of the month. */
  recapHref: string;
};

/**
 * "Como foi {mês}" (doc 02 §6.12): paid income, paid expenses and what was
 * left (or missing), the same sum as the Resumo mensal. A short month is
 * said plainly, with no red and no blame (§10.2).
 */
export function ClosingSummaryCard({
  monthName,
  previousMonthName,
  incomeCents,
  expenseCents,
  leftCents,
  previousLeftCents,
  hasPending,
  pendingHref,
  recapHref,
}: ClosingSummaryCardProps) {
  return (
    <Card asChild className="flex flex-col gap-3 lg:col-span-2">
      <section aria-labelledby="fechamento-resumo">
        <h2 id="fechamento-resumo" className="text-headline text-fg">
          Como foi {monthName}
        </h2>
        <p className="text-callout text-fg-2">
          {closingHeadline(leftCents, monthName)}
        </p>
        <div className="grid grid-cols-fit gap-2 md:grid-cols-3 md:gap-4">
          <KpiTile
            label="Receitas"
            value={
              <Money
                cents={incomeCents}
                variant="title"
                sign="never"
                tone="neutral"
              />
            }
          />
          <KpiTile
            label="Despesas"
            value={
              <Money
                cents={expenseCents}
                variant="title"
                sign="never"
                tone="neutral"
              />
            }
          />
          <KpiTile
            label={leftCents < 0 ? "Faltou" : "Sobrou"}
            value={
              <Money
                cents={Math.abs(leftCents)}
                variant="title"
                sign="never"
                tone="neutral"
              />
            }
            className="col-span-full md:col-span-1"
          />
        </div>
        {previousLeftCents !== null ? (
          <p className="text-callout text-fg-2">
            Em {previousMonthName},{" "}
            {previousLeftCents < 0 ? "faltaram" : "sobraram"}{" "}
            <Money
              cents={Math.abs(previousLeftCents)}
              variant="callout"
              sign="never"
              tone="neutral"
            />
            .
          </p>
        ) : null}
        {hasPending ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-callout text-fg-2">
              Há lançamentos de {monthName} ainda pendentes: eles não entram
              nesta conta.
            </p>
            <Link
              href={pendingHref}
              className="inline-flex h-11 items-center rounded-control px-2 text-callout font-semibold text-primary transition-colors duration-100 hover:bg-primary-soft/60 active:bg-primary-soft"
            >
              Ver pendentes
            </Link>
          </div>
        ) : null}
        <Button asChild variant="tonal" className="self-start">
          <Link href={recapHref}>
            <Play aria-hidden="true" />
            Ver a retrospectiva
          </Link>
        </Button>
      </section>
    </Card>
  );
}
