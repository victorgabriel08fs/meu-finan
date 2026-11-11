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

/** "Hoje", "Amanhã", then the short weekday ("sex"), and the date ("13 nov"). */
function dayLabels(
  date: string,
  today: string,
): { name: string; date: string } {
  const [weekday = "", rest = ""] = weekdayDateLabel(date).split(", ");
  const diff = daysBetween(parse(today), parse(date));
  const name = diff === 0 ? "Hoje" : diff === 1 ? "Amanhã" : weekday;
  return { name, date: rest };
}

/**
 * Quanto dá para gastar por dia on the Início (doc 02 §6.3): one card per day
 * from today, side by side in a strip that scrolls on its own, the forecast
 * balance of the day-to-day accounts spread over the days left. The cards are
 * their own text equivalent (§9.5).
 */
export function SpendablePerDayBlock({
  spendable,
  today,
  isCurrent,
  reportHref = "/relatorios/fluxo",
}: SpendablePerDayBlockProps) {
  const { rows, shortfallCents, until, balanceTodayCents } = spendable;
  const untilLabel = shortDateLabel(until);
  const nothingLeft = rows.every((row) => row.perDayCents === 0);

  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="inicio-gasto-por-dia">
        <div className="flex flex-wrap items-start justify-between gap-x-3">
          <div className="flex min-w-0 flex-[1_1_8rem] flex-col">
            <h2
              id="inicio-gasto-por-dia"
              className="text-balance text-headline text-fg"
            >
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
        {nothingLeft ? (
          <NothingLeft
            untilLabel={untilLabel}
            shortfallCents={shortfallCents}
            balanceTodayCents={balanceTodayCents}
          />
        ) : (
          <>
            {/* The strip is focusable so the keyboard can scroll it (WCAG 2.1.1). */}
            <section
              aria-label="Quanto dá para gastar em cada dia"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must take focus (WCAG 2.1.1)
              tabIndex={0}
              className="scrollbar-none relative overflow-x-auto overscroll-x-contain rounded-chip pb-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
            >
              <ul className="flex w-max min-w-full gap-2">
                {rows.map((row) => {
                  const labels = dayLabels(row.date, today);
                  const isToday = row.date === today;
                  return (
                    <li
                      key={row.date}
                      aria-current={isToday ? "date" : undefined}
                      className="shrink-0 snap-start"
                    >
                      <div
                        className={cn(
                          "flex w-[6.25rem] flex-col gap-0.5 rounded-card p-3",
                          isToday ? "bg-primary-soft" : "bg-surface-2",
                        )}
                      >
                        <span
                          className={cn(
                            "text-caption font-semibold",
                            CLAMP_TEXT,
                            isToday ? "text-on-primary-soft" : "text-fg",
                          )}
                        >
                          {labels.name}
                        </span>
                        <span
                          className={cn(
                            "text-caption",
                            CLAMP_TEXT,
                            isToday ? "text-on-primary-soft" : "text-fg-3",
                          )}
                        >
                          {labels.date}
                        </span>
                        <span>
                          <Money
                            cents={row.perDayCents}
                            variant="callout"
                            tone="neutral"
                            fit
                            className="font-bold"
                          />
                          <span className="sr-only"> por dia</span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
            <p className="text-caption text-fg-3">
              Pelo saldo e pelo agendado, sem o orçamento, dividido pelos dias
              que faltam.
            </p>
          </>
        )}
      </section>
    </Card>
  );
}

/** Every day at zero: the forecast runs out. */
function NothingLeft({
  untilLabel,
  shortfallCents,
  balanceTodayCents,
}: {
  untilLabel: string;
  shortfallCents: number;
  /** Forecast balance at the end of today. */
  balanceTodayCents: number | null;
}) {
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
