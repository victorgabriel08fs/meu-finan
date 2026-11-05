import { TriangleAlert } from "lucide-react";
import { shortDateLabel } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import type { CashFlowReport } from "@/server/domain/reports";
import { RECURRENCE_HORIZON_DAYS } from "@/server/domain/transactions";
import { type LowestTone, lowestTone } from "./cash-flow-model";
import { CompactMoney, KpiTile } from "./kpi-tile";

type CashFlowKpiTilesProps = {
  report: CashFlowReport;
  /** The month's first and last day, `YYYY-MM-DD`. */
  start: string;
  end: string;
  /** `YYYY-MM-DD` in the user's time zone. */
  today: string;
  /** On every tile (e.g. a flat surface inside another card). */
  tileClassName?: string;
  /** On the third tile only (e.g. its column span). */
  lastTileClassName?: string;
};

/**
 * The three figures of Fluxo de caixa (doc 02 §6.12), by phase: where the
 * balance is (today, at the end of a past month, at the start of a month
 * ahead), where it ends or how much it changed, and the lowest balance.
 * Siblings in a fragment: the caller lays them out.
 */
export function CashFlowKpiTiles({
  report,
  start,
  end,
  today,
  tileClassName,
  lastTileClassName,
}: CashFlowKpiTilesProps) {
  const endLabel = shortDateLabel(end);
  const todayPoint = report.days.find((day) => day.date === today);
  const low =
    report.phase === "past" ? report.lowestRealized : report.lowestProjected;
  const tone = lowestTone(report);
  const projects = report.phase !== "past";

  return (
    <>
      {report.phase === "current" ? (
        <KpiTile
          className={tileClassName}
          label="Saldo hoje"
          value={<CompactMoney cents={todayPoint?.realizedCents ?? 0} />}
          support="em contas, sem cartões"
        />
      ) : report.phase === "past" ? (
        <KpiTile
          className={tileClassName}
          label={`Saldo em ${endLabel}`}
          value={<CompactMoney cents={report.endCents} />}
          support="no fim do mês"
        />
      ) : (
        <KpiTile
          className={tileClassName}
          label={`Previsto em ${shortDateLabel(start)}`}
          value={<CompactMoney cents={report.startCents} />}
          support="no início do mês"
        />
      )}
      {report.phase === "past" ? (
        <KpiTile
          className={tileClassName}
          label="Variação no mês"
          value={
            <CompactMoney
              cents={report.endCents - report.startCents}
              sign="always"
            />
          }
          support={`de ${shortDateLabel(start)} a ${endLabel}`}
        />
      ) : (
        <KpiTile
          className={tileClassName}
          label={`Previsto para ${endLabel}`}
          value={<CompactMoney cents={report.endCents} />}
          support="com os agendados e as faturas"
        />
      )}
      <KpiTile
        className={cn(tileClassName, lastTileClassName)}
        label={projects ? "Menor saldo previsto" : "Menor saldo"}
        value={<CompactMoney cents={low?.cents ?? report.endCents} />}
        support={low ? <LowSupport date={low.date} tone={tone} /> : null}
      />
    </>
  );
}

/** "em 25/out", or "negativo em 25/out" with an icon in the status tone. */
export function LowSupport({ date, tone }: { date: string; tone: LowestTone }) {
  if (!tone) return <>em {shortDateLabel(date)}</>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-bold",
        tone === "danger" ? "text-danger" : "text-warning",
      )}
    >
      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      negativo em {shortDateLabel(date)}
    </span>
  );
}

/** A month ahead only knows what is already scheduled. */
export function cashFlowFutureNote(
  report: Pick<CashFlowReport, "phase">,
): string | undefined {
  if (report.phase !== "future") return undefined;
  return `Só entra o que já está agendado; repetições aparecem até ${RECURRENCE_HORIZON_DAYS} dias à frente.`;
}
