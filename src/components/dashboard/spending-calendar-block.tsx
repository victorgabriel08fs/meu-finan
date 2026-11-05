"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import {
  calendarStats,
  daysWithoutLabel,
} from "@/components/reports/calendar-model";
import { CompactMoney, KpiTile } from "@/components/reports/kpi-tile";
import { SpendingCalendarView } from "@/components/reports/spending-calendar";
import { Card } from "@/components/ui/card";
import { shortDateLabel } from "@/lib/format/date";
import type { DaySpending, ReportPhase } from "@/server/domain/reports";
import { BlockInvite } from "./block-invite";
import { BlockLink } from "./block-link";

type SpendingCalendarBlockProps = {
  /** Every day of the month the Início shows. */
  days: DaySpending[];
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
  /** "outubro de 2026". */
  monthTitle: string;
  /** Relatórios › Calendário for the same month (`?mes=` when not today's). */
  reportHref: string;
  phase: ReportPhase;
};

/** The report with a day chosen: its expenses are listed under the calendar. */
export function calendarDayHref(reportHref: string, date: string): string {
  return `${reportHref}${reportHref.includes("?") ? "&" : "?"}dia=${date}`;
}

/** Tiles inside the card: a step down from the card itself. */
const TILE = "bg-surface-2 shadow-none";

/**
 * Calendário de gastos on the Início (doc 02 §6.3, §6.12): the report's
 * heatmap for the month on screen with its three figures beside it (below
 * on phones). Choosing a day opens the report on that day.
 */
export function SpendingCalendarBlock({
  days,
  today,
  monthTitle,
  reportHref,
  phase,
}: SpendingCalendarBlockProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const stats = calendarStats(days, today);

  return (
    <Card asChild className="flex flex-col gap-3">
      <section
        aria-labelledby="inicio-calendario"
        aria-busy={isPending || undefined}
        data-pending={isPending ? "" : undefined}
        className="transition-opacity duration-150 data-pending:opacity-60"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h2 id="inicio-calendario" className="text-headline text-fg">
              Gastos por dia
            </h2>
            <p className="text-caption text-fg-3">
              Despesas pagas; no cartão, na data da compra
            </p>
          </div>
          <BlockLink href={reportHref}>Ver relatório</BlockLink>
        </div>
        {/* By the width of its place on the Início (an @container): beside
            the figures in a whole row, over them in two thirds of one. */}
        <div className="grid gap-4 @2xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] @2xl:items-start">
          <SpendingCalendarView
            days={days}
            today={today}
            monthTitle={monthTitle}
            selected={null}
            onSelect={(date) =>
              startTransition(() =>
                router.push(calendarDayHref(reportHref, date)),
              )
            }
            caption={`Gastos por dia em ${monthTitle}. Escolha um dia para ver as despesas no relatório.`}
          />
          {phase === "future" ? null : (
            <div className="grid grid-cols-2 gap-2 @min-[34rem]:grid-cols-3 @2xl:grid-cols-1">
              <KpiTile
                className={TILE}
                label="Gasto no mês"
                value={<CompactMoney cents={stats.totalCents} />}
                support={
                  phase === "past"
                    ? "mês completo"
                    : `em ${stats.elapsedDays} ${stats.elapsedDays === 1 ? "dia" : "dias"}`
                }
              />
              <KpiTile
                className={TILE}
                label="Média por dia"
                value={<CompactMoney cents={stats.averageCents ?? 0} />}
                support={daysWithoutLabel(stats.daysWithout)}
              />
              <KpiTile
                className={`col-span-2 @min-[34rem]:col-span-1 ${TILE}`}
                label="Dia mais caro"
                value={stats.top ? shortDateLabel(stats.top.date) : "—"}
                support={
                  stats.top ? (
                    <CompactMoney cents={stats.top.cents} />
                  ) : (
                    "sem gastos pagos"
                  )
                }
              />
            </div>
          )}
        </div>
      </section>
    </Card>
  );
}

/**
 * The block in a month without expenses: a compact invite, like the
 * Orçamento's, instead of an empty calendar.
 */
export function SpendingCalendarInvite({ monthName }: { monthName: string }) {
  return (
    <BlockInvite
      icon={<CalendarDays />}
      title={`Nenhuma despesa em ${monthName}`}
      description="Quando houver, o calendário mostra os dias de mais gasto."
      action={
        <QuickAddButton kind="expense" variant="tonal" size="sm">
          Adicionar despesa
        </QuickAddButton>
      }
    />
  );
}
