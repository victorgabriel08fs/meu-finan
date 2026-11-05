import { ChartLine, Landmark } from "lucide-react";
import Link from "next/link";
import { QuickAddButton } from "@/components/quick-add/quick-add-trigger";
import {
  CashFlowChart,
  CashFlowLegend,
} from "@/components/reports/cash-flow-card";
import {
  CashFlowKpiTiles,
  cashFlowFutureNote,
} from "@/components/reports/cash-flow-kpis";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CashFlowReport } from "@/server/domain/reports";
import { BlockInvite } from "./block-invite";
import { BlockLink } from "./block-link";

type CashFlowBlockProps = {
  report: CashFlowReport;
  /** The month the Início shows: its first and last day, `YYYY-MM-DD`. */
  start: string;
  end: string;
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
  /** Relatórios › Fluxo for the same month (`?mes=` when not today's). */
  reportHref: string;
};

/** Tiles inside the card: a step down from the card itself. */
const TILE = "bg-surface-2 shadow-none";

/**
 * Fluxo de caixa on the Início (doc 02 §6.3, §6.12): the report's "Saldo dia
 * a dia" for the month on screen and its lowest balance — under the chart,
 * beside it when the block has a whole desktop row (an @container, like the
 * Calendário). Today's balance and the forecast are the Saldo's, not here.
 */
export function CashFlowBlock({
  report,
  start,
  end,
  today,
  reportHref,
}: CashFlowBlockProps) {
  return (
    <Card asChild className="flex flex-col gap-3">
      <section aria-labelledby="inicio-fluxo">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h2 id="inicio-fluxo" className="text-headline text-fg">
              Fluxo de caixa
            </h2>
            <p className="text-caption text-fg-3">
              Saldo dia a dia, sem os cartões
            </p>
          </div>
          <BlockLink href={reportHref}>Ver relatório</BlockLink>
        </div>
        <div className="grid gap-4 @2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] @2xl:items-start">
          <div className="flex min-w-0 flex-col gap-3">
            <CashFlowLegend report={report} />
            {/* A new month starts on its own day, not on the last one picked. */}
            <CashFlowChart
              key={start}
              report={report}
              today={today}
              note={cashFlowFutureNote(report)}
            />
          </div>
          <CashFlowKpiTiles
            report={report}
            start={start}
            end={end}
            today={today}
            only="lowest"
            tileClassName={TILE}
          />
        </div>
      </section>
    </Card>
  );
}

/** No account off the cards: nothing to follow day by day. */
export function CashFlowNoAccountsInvite() {
  return (
    <BlockInvite
      icon={<Landmark />}
      title="Nenhuma conta fora dos cartões"
      description="O fluxo de caixa acompanha o saldo das suas contas, sem os cartões."
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href="/contas">Ver contas</Link>
        </Button>
      }
    />
  );
}

/** A month with nothing paid or scheduled and every balance at zero. */
export function CashFlowInvite({ monthName }: { monthName: string }) {
  return (
    <BlockInvite
      icon={<ChartLine />}
      title={`Nenhum lançamento em ${monthName}`}
      description="Quando houver, o gráfico mostra o saldo dia a dia."
      action={
        <QuickAddButton kind="expense" variant="tonal" size="sm">
          Adicionar lançamento
        </QuickAddButton>
      }
    />
  );
}
