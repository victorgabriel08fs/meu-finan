import type { ReactNode } from "react";
import { Money } from "@/components/money/money";
import { cn } from "@/lib/utils";
import type { StatementSummary } from "./statement-data";

type StatementSummaryCardProps = {
  summary: StatementSummary;
  /** "outubro" */
  monthName: string;
  /**
   * flow: paid income and expenses, scheduled ones on a line below ·
   * pending: the "Pendentes" filter, scheduled values up front ·
   * transfer: the "Transferências" filter, the total moved.
   */
  mode: "flow" | "pending" | "transfer";
};

/**
 * Summary of what the statement shows (doc 02 §6.4): Entradas, Saídas and
 * Saldo, following the filters exactly. Values are never cut (§8): below
 * 360px the balance moves to its own line.
 */
export function StatementSummaryCard({
  summary,
  monthName,
  mode,
}: StatementSummaryCardProps) {
  if (mode === "transfer") {
    return (
      <section
        aria-label={`Resumo de ${monthName}`}
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-card bg-surface px-4 py-3.5 shadow-card"
      >
        <span className="text-caption font-semibold text-fg-3">
          Transferido em {monthName}
        </span>
        <Money
          cents={summary.transferCents}
          variant="headline"
          tone="transfer"
          className="font-bold text-fg"
        />
      </section>
    );
  }

  const pending = mode === "pending";
  const income = pending ? summary.pendingIncomeCents : summary.incomeCents;
  const expense = pending ? summary.pendingExpenseCents : summary.expenseCents;
  const showScheduled =
    !pending &&
    (summary.pendingIncomeCents > 0 || summary.pendingExpenseCents > 0);

  return (
    <section
      aria-label={
        pending ? `Agendados de ${monthName}` : `Resumo de ${monthName}`
      }
      className="rounded-card bg-surface px-4 py-3.5 shadow-card"
    >
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 min-[22.5rem]:grid-cols-3">
        <Stat label={pending ? "A receber" : "Entradas"}>
          <Money
            cents={income}
            variant="callout"
            tone="income"
            sign="never"
            className="font-bold"
          />
        </Stat>
        <Stat label={pending ? "A pagar" : "Saídas"} className="border-l pl-3">
          <Money
            cents={expense}
            variant="callout"
            tone="neutral"
            sign="never"
            className="font-bold"
          />
        </Stat>
        <Stat
          label={pending ? "Saldo previsto" : "Saldo"}
          className="col-span-2 border-t pt-2 min-[22.5rem]:col-span-1 min-[22.5rem]:border-t-0 min-[22.5rem]:border-l min-[22.5rem]:pt-0 min-[22.5rem]:pl-3"
        >
          <Money
            cents={income - expense}
            variant="callout"
            tone="neutral"
            sign="always"
            className="font-bold"
          />
        </Stat>
      </dl>
      {showScheduled ? (
        <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 border-t border-border pt-2.5 text-caption text-fg-3">
          <span className="font-semibold">Agendados:</span>
          {summary.pendingIncomeCents > 0 ? (
            <span>
              <Money
                cents={summary.pendingIncomeCents}
                variant="caption"
                tone="neutral"
                sign="always"
                className="font-semibold text-fg-2"
              />{" "}
              a receber
            </span>
          ) : null}
          {summary.pendingIncomeCents > 0 && summary.pendingExpenseCents > 0 ? (
            <span aria-hidden="true">·</span>
          ) : null}
          {summary.pendingExpenseCents > 0 ? (
            <span>
              <Money
                cents={-summary.pendingExpenseCents}
                variant="caption"
                tone="neutral"
                className="font-semibold text-fg-2"
              />{" "}
              a pagar
            </span>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-0.5 border-border", className)}
    >
      <dt className="text-caption font-semibold text-fg-3">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
