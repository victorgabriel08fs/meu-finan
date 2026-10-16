import { CalendarDays, ChevronRight, Target } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CategoryIcon } from "@/components/finance/category-icon";
import {
  Meter,
  type MeterStatus,
  StatusLabel,
} from "@/components/finance/meter";
import { Money } from "@/components/money/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import type { BudgetItem, BudgetOverview } from "@/server/domain/budgets";

/** Soft background per status, so the label reads as a pill (mockup Main). */
const PILL: Record<MeterStatus, string> = {
  over: "bg-danger-soft text-danger",
  ahead: "bg-warning-soft text-warning",
  on_track: "bg-primary-soft text-on-primary-soft",
  scheduled: "bg-surface-2 text-fg-2",
};

export function StatusPill({ status }: { status: MeterStatus }) {
  return (
    <StatusLabel
      status={status}
      className={cn("h-6.5 rounded-full px-2.5 font-bold", PILL[status])}
    />
  );
}

type BudgetCardProps = {
  total: NonNullable<BudgetOverview["total"]>;
  items: BudgetItem[];
  /** "outubro". */
  monthName: string;
  isCurrent: boolean;
  /** "31/out": last day of the period. */
  endLabel: string;
  href: string;
};

/**
 * Orçamento do mês (doc 02 §6.3, §5.9): spent of budget, stacked meter (spent
 * + scheduled hatched + today marker), how much is left per day and the
 * three most urgent categories (the server sorts them by severity).
 */
export function BudgetCard({
  total,
  items,
  monthName,
  isCurrent,
  endLabel,
  href,
}: BudgetCardProps) {
  const { pace } = total;
  const percent = Math.round(pace.elapsedRatio * 100);
  const valueText = [
    `${formatBRL(total.spentCents)} gastos de ${formatBRL(total.budgetCents)}`,
    total.scheduledCents > 0
      ? `${formatBRL(total.scheduledCents)} agendados`
      : null,
    isCurrent ? `${percent}% do mês decorrido` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Card className="relative flex flex-col gap-3">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h2 className="text-headline text-fg">
          <Link
            href={href}
            className="outline-0 after:absolute after:inset-0 after:rounded-card focus-visible:after:outline-2 focus-visible:after:outline-focus focus-visible:after:outline-solid"
          >
            Orçamento de {monthName}
          </Link>
        </h2>
        <span
          aria-hidden="true"
          className="flex items-center gap-0.5 text-callout font-semibold text-primary"
        >
          Ver
          <ChevronRight className="size-4" />
        </span>
      </div>

      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <Money cents={total.spentCents} variant="title" tone="neutral" />
        <span className="text-callout text-fg-3">
          gastos de{" "}
          <Money
            cents={total.budgetCents}
            variant="callout"
            tone="neutral"
            className="text-inherit"
          />
        </span>
      </p>

      <Meter
        value={total.spentCents}
        max={total.budgetCents}
        scheduled={total.scheduledCents}
        pace={isCurrent ? pace.elapsedRatio : undefined}
        status={pace.status}
        label={`Orçamento de ${monthName}`}
        valueText={valueText}
        className="h-2.5"
      />

      <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-micro text-fg-2">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("size-2.5 rounded-[3px]", swatchOf(pace.status))}
          />
          Gasto
        </li>
        {total.scheduledCents > 0 ? (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                "size-2.5 rounded-[3px] bg-hatch opacity-60",
                hatchOf(pace.status),
              )}
            />
            Agendado{" "}
            <Money
              cents={total.scheduledCents}
              variant="caption"
              tone="neutral"
              className="text-micro text-inherit"
            />
          </li>
        ) : null}
        {isCurrent ? (
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-fg" />
            Hoje
          </li>
        ) : null}
      </ul>

      <PaceNote
        total={total}
        isCurrent={isCurrent}
        monthName={monthName}
        endLabel={endLabel}
      />

      {items.length > 0 ? (
        <ul aria-label="Categorias que pedem atenção" className="-mb-1">
          {items.slice(0, 3).map((item) => (
            <li
              key={item.id}
              className="flex min-h-13 items-center gap-3 border-t border-border py-2"
            >
              <CategoryIcon
                icon={item.categoryIcon}
                color={item.categoryColor}
                size="sm"
                className="size-8"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-semibold text-fg">
                  {item.categoryName}
                </span>
                <span className="truncate text-caption text-fg-3">
                  <Money
                    cents={item.spentCents}
                    variant="caption"
                    tone="neutral"
                    className="text-inherit"
                  />{" "}
                  de{" "}
                  <Money
                    cents={item.budgetCents}
                    variant="caption"
                    tone="neutral"
                    className="text-inherit"
                  />
                </span>
              </div>
              <StatusPill status={item.pace.status} />
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function swatchOf(status: MeterStatus) {
  if (status === "over") return "bg-danger-fill";
  if (status === "ahead") return "bg-warning-fill";
  return "bg-primary";
}

function hatchOf(status: MeterStatus) {
  if (status === "over") return "text-danger-fill";
  if (status === "ahead") return "text-warning-fill";
  return "text-primary";
}

/** "Pode gastar R$ 53,00 por dia até 31/out" — or how the month ended. */
function PaceNote({
  total,
  isCurrent,
  monthName,
  endLabel,
}: {
  total: BudgetCardProps["total"];
  isCurrent: boolean;
  monthName: string;
  endLabel: string;
}) {
  const { pace } = total;
  let content: ReactNode;
  if (isCurrent && pace.availableCents > 0 && pace.remainingDays > 0) {
    content = (
      <>
        Pode gastar{" "}
        <strong className="font-bold text-fg">
          <Money
            cents={pace.perDayCents}
            variant="callout"
            tone="neutral"
            className="font-bold"
          />{" "}
          por dia
        </strong>{" "}
        até {endLabel}
      </>
    );
  } else if (isCurrent) {
    content = (
      <>
        O orçamento de {monthName} já está todo comprometido
        {pace.availableCents < 0 ? (
          <>
            {" "}
            — passou{" "}
            <strong className="font-bold text-fg">
              <Money
                cents={-pace.availableCents}
                variant="callout"
                tone="neutral"
                className="font-bold"
              />
            </strong>
          </>
        ) : null}
        .
      </>
    );
  } else {
    const left = total.budgetCents - total.spentCents;
    content =
      left >= 0 ? (
        <>
          Sobraram{" "}
          <strong className="font-bold text-fg">
            <Money
              cents={left}
              variant="callout"
              tone="neutral"
              className="font-bold"
            />
          </strong>{" "}
          do orçamento de {monthName}.
        </>
      ) : (
        <>
          Os gastos de {monthName} passaram{" "}
          <strong className="font-bold text-fg">
            <Money
              cents={-left}
              variant="callout"
              tone="neutral"
              className="font-bold"
            />
          </strong>{" "}
          do orçamento.
        </>
      );
  }
  return (
    <div className="flex items-center gap-2.5 rounded-control bg-bg px-3 py-2.5">
      <CalendarDays aria-hidden="true" className="size-5 shrink-0 text-fg-3" />
      <p className="text-callout text-fg-2">{content}</p>
    </div>
  );
}

/** No budget yet: a compact invitation (doc 02 §8, "Planeje o mês"). */
export function BudgetInvite({ href }: { href: string }) {
  return (
    <Card className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft"
      >
        <Target className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="text-headline text-fg">Planeje o mês</h2>
        <p className="text-caption text-fg-3">
          Defina quanto gastar por categoria e acompanhe o ritmo.
        </p>
      </div>
      <Button asChild variant="tonal" size="sm">
        <Link href={href}>Criar</Link>
      </Button>
    </Card>
  );
}
