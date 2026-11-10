import { Landmark } from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/money/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CLAMP_TEXT } from "@/components/ui/clamp";
import { daysBetween, parse } from "@/lib/finance/dates";
import { shortDateLabel, weekdayDateLabel } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import type { SpendablePerDay } from "@/server/domain/dashboard";
import { BlockInvite } from "./block-invite";
import { BlockLink } from "./block-link";
import { monthName } from "./labels";

type SpendablePerDayBlockProps = {
  spendable: SpendablePerDay;
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
  /** The Início shows the month that contains today; otherwise a caption says "a partir de hoje". */
  isCurrent: boolean;
  /** Relatórios › Fluxo. */
  reportHref?: string;
};

/** Days listed: the next two weeks, or the rest of the month when it is shorter. */
export const SPENDABLE_DAYS = 14;

/** "Hoje", "Amanhã", then "sex, 13 nov". */
function dayLabel(date: string, today: string): string {
  const diff = daysBetween(parse(today), parse(date));
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  return weekdayDateLabel(date);
}

/**
 * Quanto dá para gastar por dia on the Início (doc 02 §6.3): today's amount
 * and one line per day ahead, the forecast balance of the day-to-day accounts
 * spread over the days left. The list is its own text equivalent (§9.5): the
 * bar only repeats the proportion.
 */
export function SpendablePerDayBlock({
  spendable,
  today,
  isCurrent,
  reportHref = "/relatorios/fluxo",
}: SpendablePerDayBlockProps) {
  const { rows, shortfallCents, until, hasBudget, budgetMonth } = spendable;
  const balanceTodayCents = spendable.balanceTodayCents;
  const untilLabel = shortDateLabel(until);
  const first = rows[0];
  const largest = Math.max(0, ...rows.map((row) => row.perDayCents));
  const anyCapped = rows.some((row) => row.cappedByBudget);
  // The footer says it when the budget limits every line; each line says it
  // (for the reader) only when it limits some.
  const someCapped = anyCapped && !rows.every((row) => row.cappedByBudget);
  const nothingLeft = largest === 0;

  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="inicio-gasto-por-dia">
        <div className="flex flex-wrap items-start justify-between gap-x-3">
          <div className="flex min-w-0 flex-[1_1_8rem] flex-col">
            <h2 id="inicio-gasto-por-dia" className="text-headline text-fg">
              Quanto dá para gastar por dia
            </h2>
            <p className="text-caption text-fg-3">
              {isCurrent
                ? `Contas do dia a dia, até ${untilLabel}`
                : `A partir de hoje, até ${untilLabel}`}
            </p>
          </div>
          <BlockLink href={reportHref}>Ver fluxo</BlockLink>
        </div>
        {nothingLeft || !first ? (
          <NothingLeft
            untilLabel={untilLabel}
            shortfallCents={shortfallCents}
            balanceTodayCents={balanceTodayCents}
            budgetMonth={hasBudget && anyCapped ? budgetMonth : null}
          />
        ) : (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <Money cents={first.perDayCents} variant="title" tone="neutral" />
              <span className="text-callout text-fg-3">por dia</span>
            </p>
            {/* One line (the last day of the month) only repeats the figure above. */}
            {rows.length < 2 ? null : (
              <ul className="-my-1 flex flex-col">
                {rows.map((row) => (
                  <li
                    key={row.date}
                    className="grid grid-cols-[5.25rem_minmax(1.5rem,1fr)_auto] items-center gap-x-3 py-0.5 @max-[14rem]:grid-cols-1 @max-[14rem]:gap-y-1 @max-[14rem]:py-2"
                  >
                    <span
                      className={cn(
                        "text-callout",
                        CLAMP_TEXT,
                        row.date === today
                          ? "font-semibold text-fg"
                          : "text-fg-2",
                      )}
                    >
                      {dayLabel(row.date, today)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-1.5 overflow-hidden rounded-full bg-primary-soft @max-[14rem]:order-3"
                    >
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.round((row.perDayCents / largest) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="text-right @max-[14rem]:order-2 @max-[14rem]:text-left">
                      <Money
                        cents={row.perDayCents}
                        variant="callout"
                        tone="neutral"
                        fit
                      />
                      {someCapped && row.cappedByBudget ? (
                        <span className="sr-only">
                          , limitado pelo orçamento
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-caption text-fg-3">
              {anyCapped
                ? `${someCapped ? "Alguns dias limitados" : "Limitado"} pelo orçamento de ${monthName(budgetMonth)}.`
                : "Saldo previsto dividido pelos dias que faltam."}
            </p>
          </>
        )}
      </section>
    </Card>
  );
}

/** Every day at zero: the forecast runs out, or the budget has nothing left. */
function NothingLeft({
  untilLabel,
  shortfallCents,
  balanceTodayCents,
  budgetMonth,
}: {
  untilLabel: string;
  shortfallCents: number;
  /** Forecast balance at the end of today. */
  balanceTodayCents: number | null;
  /** Set when the budget is what leaves nothing, with the balance positive. */
  budgetMonth: string | null;
}) {
  if (budgetMonth !== null && shortfallCents === 0) {
    return (
      <div className="flex flex-col gap-0.5">
        <p className="text-headline text-warning">
          Não sobra para gastar até {untilLabel}
        </p>
        <p className="text-caption text-fg-3">
          O orçamento de {monthName(budgetMonth)} não deixa mais para os dias
          que faltam.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <p
        className={cn(
          "text-headline",
          shortfallCents > 0 ? "text-danger" : "text-warning",
        )}
      >
        Não sobra para gastar até {untilLabel}
      </p>
      <p className="text-caption text-fg-3">
        {shortfallCents > 0 ? (
          <>
            Faltam{" "}
            <Money
              cents={shortfallCents}
              variant="callout"
              tone="neutral"
              className="font-semibold"
            />{" "}
            para as contas agendadas.
          </>
        ) : balanceTodayCents !== null && balanceTodayCents > 0 ? (
          `O saldo previsto chega a zero antes de ${untilLabel}.`
        ) : (
          `Sem saldo nas contas para gastar até ${untilLabel}.`
        )}
      </p>
    </div>
  );
}

/** No account off the cards and caixinhas: nothing to spread over the days. */
export function SpendablePerDayNoAccountsInvite() {
  return (
    <BlockInvite
      icon={<Landmark />}
      title="Nenhuma conta para o dia a dia"
      description="A conta de quanto dá para gastar usa o saldo das suas contas, sem cartões e caixinhas."
      action={
        <Button asChild variant="secondary" size="md">
          <Link href="/contas">Ver contas</Link>
        </Button>
      }
    />
  );
}
