// "Parcelas a terminar" (doc 02 §6.3): reduces the pending installments of
// the person's purchases to one summary per plan. Pure: the query lives in
// src/server/domain/dashboard.ts.

/** One pending installment (an expense, so `amountCents` is negative). */
export type InstallmentRow = {
  planId: string;
  /** Description of this installment's own row. */
  description: string;
  /** Plan's number of installments. */
  count: number;
  accountId: string;
  accountName: string;
  number: number;
  amountCents: number;
  /** `YYYY-MM-DD`. */
  occurredOn: string;
};

export type EndingInstallment = {
  planId: string;
  description: string;
  accountId: string;
  accountName: string;
  /** What is left to pay, positive. */
  remainingCents: number;
  remainingCount: number;
  /** Number of the next installment (`nextNumber` of `count`). */
  nextNumber: number;
  count: number;
  nextOn: string;
  /** Positive. */
  nextAmountCents: number;
  /** Date of the last pending installment. */
  endsOn: string;
};

export type InstallmentsSummary = {
  items: EndingInstallment[];
  /** Plans with something left, shown or not. */
  totalPlans: number;
  /** The next installment of every plan, summed. */
  monthlyCents: number;
};

function isBefore(a: InstallmentRow, b: InstallmentRow): boolean {
  return a.occurredOn === b.occurredOn
    ? a.number < b.number
    : a.occurredOn < b.occurredOn;
}

/**
 * One entry per plan with at least one row: ordered by the plan that ends
 * first, then the smaller remainder, then the plan id; `items` is cut at
 * `limit` while `totalPlans` and `monthlyCents` cover every plan.
 */
export function summarizeInstallmentPlans(
  rows: readonly InstallmentRow[],
  limit: number,
): InstallmentsSummary {
  const plans = new Map<string, EndingInstallment>();
  const nextRows = new Map<string, InstallmentRow>();
  for (const row of rows) {
    const cents = Math.abs(row.amountCents);
    const next = nextRows.get(row.planId);
    const plan = plans.get(row.planId);
    if (!plan || !next) {
      plans.set(row.planId, {
        planId: row.planId,
        description: row.description,
        accountId: row.accountId,
        accountName: row.accountName,
        remainingCents: cents,
        remainingCount: 1,
        nextNumber: row.number,
        count: row.count,
        nextOn: row.occurredOn,
        nextAmountCents: cents,
        endsOn: row.occurredOn,
      });
      nextRows.set(row.planId, row);
      continue;
    }
    plan.remainingCents += cents;
    plan.remainingCount += 1;
    if (row.occurredOn > plan.endsOn) plan.endsOn = row.occurredOn;
    if (isBefore(row, next)) {
      nextRows.set(row.planId, row);
      plan.description = row.description;
      plan.accountId = row.accountId;
      plan.accountName = row.accountName;
      plan.nextNumber = row.number;
      plan.nextOn = row.occurredOn;
      plan.nextAmountCents = cents;
    }
  }
  const all = [...plans.values()].sort(
    (a, b) =>
      (a.endsOn < b.endsOn ? -1 : a.endsOn > b.endsOn ? 1 : 0) ||
      a.remainingCents - b.remainingCents ||
      (a.planId < b.planId ? -1 : a.planId > b.planId ? 1 : 0),
  );
  return {
    items: all.slice(0, limit),
    totalPlans: all.length,
    monthlyCents: all.reduce((sum, plan) => sum + plan.nextAmountCents, 0),
  };
}
