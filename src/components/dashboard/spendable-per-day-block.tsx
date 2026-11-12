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
import { ACCOUNT_DOT } from "./account-dot";
import { BlockInvite } from "./block-invite";
import { BlockLink } from "./block-link";
import { SpendableAccountsButton } from "./spendable-accounts-sheet";

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
 * balance of the day-to-day accounts spread over the days left. With two or
 * more accounts, each card also has a line per account the person shows
 * ("Escolher contas"), by the same rule over that account alone. The cards
 * are their own text equivalent (§9.5): "Hoje, 12 nov: R$ 85,00 por dia no
 * total; Conta principal: R$ 50,00; Reserva: Não sobra;".
 */
export function SpendablePerDayBlock({
  spendable,
  today,
  isCurrent,
  reportHref = "/relatorios/fluxo",
}: SpendablePerDayBlockProps) {
  const {
    rows,
    shortfallCents,
    until,
    balanceTodayCents,
    accounts,
    unassignedCards,
  } = spendable;
  const untilLabel = shortDateLabel(until);
  const nothingLeft = rows.every((row) => row.perDayCents === 0);
  const shown = accounts.filter((account) => account.shown);
  const lines = shown.length > 0;

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
                          "flex h-full flex-col gap-0.5 rounded-card p-3",
                          lines ? "w-34" : "w-25",
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
                          <span className="sr-only">:</span>
                        </span>
                        <span>
                          {lines ? (
                            <span
                              className={cn(
                                "block text-caption",
                                isToday ? "text-on-primary-soft" : "text-fg-3",
                              )}
                            >
                              Total
                            </span>
                          ) : null}
                          <Money
                            cents={row.perDayCents}
                            variant="callout"
                            tone="neutral"
                            fit
                            className="font-bold"
                          />
                          <span className="sr-only">
                            {lines ? " por dia;" : " por dia"}
                          </span>
                        </span>
                        {lines ? (
                          <AccountLines
                            accounts={shown}
                            byAccount={row.byAccount}
                            isToday={isToday}
                          />
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
            <p className="text-caption text-fg-3">
              Pelo saldo e pelo agendado, sem o orçamento, dividido pelos dias
              que faltam.
              {lines
                ? " Em cada conta, o saldo e o agendado dela, com as faturas que ela paga."
                : null}
            </p>
            {lines && unassignedCards.length > 0 ? (
              <UnassignedCardsNote cards={unassignedCards} />
            ) : null}
            {accounts.length >= 2 ? (
              <SpendableAccountsButton accounts={accounts} />
            ) : null}
          </>
        )}
      </section>
    </Card>
  );
}

/** The lines of a day card: each shown account and what it has for the day. */
function AccountLines({
  accounts,
  byAccount,
  isToday,
}: {
  accounts: SpendablePerDay["accounts"];
  byAccount: SpendablePerDay["rows"][number]["byAccount"];
  isToday: boolean;
}) {
  const perDay = new Map(
    byAccount.map((item) => [item.accountId, item.perDayCents]),
  );
  const muted = isToday ? "text-on-primary-soft" : "text-fg-3";
  return (
    <span className="mt-1.5 flex flex-col gap-1.5 border-t border-border pt-1.5">
      {accounts.map((account) => {
        const cents = perDay.get(account.id) ?? 0;
        return (
          <span key={account.id} className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-start gap-1">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.25 size-2 shrink-0 rounded-full",
                  ACCOUNT_DOT[account.color],
                )}
              />
              <span className={cn("min-w-0 text-caption", CLAMP_TEXT, muted)}>
                {account.name}
                <span className="sr-only">:</span>
              </span>
            </span>
            <span className="text-caption">
              {cents > 0 ? (
                <Money
                  cents={cents}
                  variant="caption"
                  tone="neutral"
                  fit
                  className="font-semibold"
                />
              ) : (
                <span className={cn("text-caption", muted)}>Não sobra</span>
              )}
              <span className="sr-only">;</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Invoices no account to spend from pays: they count only in the total. */
function UnassignedCardsNote({
  cards,
}: {
  cards: SpendablePerDay["unassignedCards"];
}) {
  const [only] = cards;
  const link = "font-semibold text-primary underline-offset-2 hover:underline";
  return (
    <p className="text-caption text-pretty text-fg-3">
      {cards.length === 1 && only ? (
        <>
          A fatura do {only.name} entra só no total.{" "}
          <Link href={`/cartoes/${only.id}`} className={link}>
            Escolher a conta que paga
          </Link>
        </>
      ) : (
        <>
          As faturas de {cards.length} cartões entram só no total.{" "}
          <Link href="/contas" className={link}>
            Ver contas
          </Link>
        </>
      )}
    </p>
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
