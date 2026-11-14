import { Repeat, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Money, spokenAmount } from "@/components/money/money";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { daysBetween, parse } from "@/lib/finance";
import {
  fullDateLabel,
  monthNameLabel,
  shortDateLabel,
} from "@/lib/format/date";
import { brlParts } from "@/lib/format/money";
import type { Subscription } from "@/lib/home/subscriptions";
import type { MonthlySubscriptions } from "@/server/domain/subscriptions";
import { BlockInvite } from "./block-invite";

type SubscriptionsBlockProps = {
  summary: MonthlySubscriptions;
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
  /** Where a row opens: the statement narrowed to that subscription. */
  hrefFor: (item: Subscription) => string;
};

const spoken = (cents: number) =>
  spokenAmount(cents, brlParts(cents, { sign: "never" }));

/** "hoje", "amanhã", "em 3 dias" (up to 6), else "em 20/nov" ("em 5/jan/27" in another year). */
export function nextDebitText(nextOn: string, today: string): string {
  const diff = daysBetween(parse(today), parse(nextOn));
  if (diff <= 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff <= 6) return `em ${diff} dias`;
  return `em ${shortDateLabel(nextOn, parse(nextOn).year !== parse(today).year)}`;
}

/** The link's accessible name: the row said out loud, amounts included. */
export function rowLabel(item: Subscription, today: string): string {
  const diff = daysBetween(parse(today), parse(item.nextOn));
  const when =
    diff <= 0
      ? "hoje"
      : diff === 1
        ? "amanhã"
        : `em ${fullDateLabel(item.nextOn)}`;
  return [
    item.description,
    `${spoken(item.amountCents)} por mês`,
    `próximo débito ${when}`,
    item.accountName,
    item.increaseCents > 0
      ? `subiu ${spoken(item.increaseCents)}${
          item.previousOn
            ? ` desde ${monthNameLabel(item.previousOn.slice(0, 7))}`
            : ""
        }`
      : null,
    "abrir no Extrato",
  ]
    .filter(Boolean)
    .join(", ")
    .replace(", abrir no Extrato", "; abrir no Extrato");
}

/** "e mais 2 assinaturas, 1 subiu". */
export function moreText(summary: MonthlySubscriptions): string {
  const hidden = summary.totalCount - summary.items.length;
  const base = `e mais ${hidden} ${hidden === 1 ? "assinatura" : "assinaturas"}`;
  const up = summary.hiddenIncreasedCount;
  if (up === 0) return base;
  return `${base}, ${up} ${up === 1 ? "subiu" : "subiram"}`;
}

/**
 * Assinaturas do mês on the Início (doc 02 §6.3): the monthly expense
 * recurrences with their next debit, and a "subiu" badge when the next one
 * costs more than the last before this month. Amounts go through `Money`, so
 * the discreet mode masks them.
 */
export function SubscriptionsBlock({
  summary,
  today,
  hrefFor,
}: SubscriptionsBlockProps) {
  const hidden = summary.totalCount - summary.items.length;
  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="inicio-assinaturas">
        <div className="flex flex-col">
          <h2 id="inicio-assinaturas" className="text-headline text-fg">
            Assinaturas do mês
          </h2>
          <p className="text-caption text-fg-3">
            Somam{" "}
            <Money
              cents={summary.monthlyCents}
              variant="caption"
              tone="neutral"
            />{" "}
            por mês
          </p>
        </div>
        <ul className="-mx-4 [&>li+li]:border-t [&>li+li]:border-border">
          {summary.items.map((item) => (
            <li
              key={item.recurrenceId}
              className="relative flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors duration-100 has-[a:active]:bg-surface-2"
            >
              <div className="flex min-w-0 flex-[1_1_9rem] flex-col gap-0.5">
                <p className="truncate text-body text-fg">
                  <Link
                    href={hrefFor(item)}
                    aria-label={rowLabel(item, today)}
                    className="outline-0 after:absolute after:inset-0 after:rounded-control focus-visible:after:outline-2 focus-visible:after:outline-solid focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
                  >
                    {item.description}
                  </Link>
                </p>
                <p className="text-caption text-fg-3">
                  {item.accountName} · próximo débito{" "}
                  {nextDebitText(item.nextOn, today)}
                </p>
              </div>
              <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
                <Money
                  cents={item.amountCents}
                  variant="headline"
                  tone="neutral"
                />
                {item.increaseCents > 0 ? (
                  <Badge tone="warning">
                    <TrendingUp aria-hidden="true" />
                    subiu{" "}
                    <Money
                      cents={item.increaseCents}
                      variant="caption"
                      sign="never"
                      tone="neutral"
                      className="text-warning"
                    />
                  </Badge>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {hidden > 0 ? (
          <p className="text-caption text-fg-3">{moreText(summary)}</p>
        ) : null}
      </section>
    </Card>
  );
}

/** No monthly expense recurrence. */
export function SubscriptionsInvite() {
  return (
    <BlockInvite
      icon={<Repeat />}
      title="Nenhuma assinatura por aqui"
      description="Lance uma despesa com Repetir “Todo mês” e ela aparece aqui, com o próximo débito."
      action={
        <QuickAddButton kind="expense" variant="tonal" size="sm">
          Adicionar gasto
        </QuickAddButton>
      }
    />
  );
}
