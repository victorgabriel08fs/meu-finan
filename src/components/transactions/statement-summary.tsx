import type { ReactNode } from "react";
import { Money } from "@/components/money/money";
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
 * Saldo, following the filters exactly. Values are never cut (§8): a value
 * that does not fit beside the others wraps to the next line, with large
 * text (200%) as well.
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
      <dl className="flex flex-wrap gap-x-4 gap-y-2">
        <Stat label={pending ? "A receber" : "Entradas"}>
          <Money
            cents={income}
            variant="callout"
            tone="income"
            sign="never"
            className="font-bold"
          />
        </Stat>
        <Stat label={pending ? "A pagar" : "Saídas"}>
          <Money
            cents={expense}
            variant="callout"
            tone="neutral"
            sign="never"
            className="font-bold"
          />
        </Stat>
        <Stat label={pending ? "Saldo previsto" : "Saldo"}>
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
              {/* The separator closes the first item: never alone at the start of a line. */}
              {summary.pendingExpenseCents > 0 ? (
                <span aria-hidden="true">&nbsp;·</span>
              ) : null}
            </span>
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

/** Label over the value; grows to share the row, never shrinks below it. */
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-[1_0_auto] flex-col gap-0.5">
      <dt className="text-caption font-semibold text-fg-3">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
