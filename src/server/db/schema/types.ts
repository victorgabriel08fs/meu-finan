// Shapes stored in jsonb columns. Writers validate them with Zod before saving;
// these types only describe what is persisted. Rates are decimals (0.1 = 10%).

/** goals.expected_rate; null means the goal has no yield ("sem rendimento"). */
export type GoalExpectedRate =
  | { index: "fixed"; annual: number } // prefixado: 0.1 = 10% a.a.
  | { index: "cdi"; pct: number } // 1.02 = 102% do CDI
  | { index: "selic"; pct: number } // 1 = 100% da Selic
  | { index: "ipca"; spread: number }; // 0.06 = IPCA + 6% a.a.

/** Rate of a saved simulation; same shape as `RateInput` (doc 03 §2.2). */
export type SimulationRate =
  | { kind: "monthly"; value: number }
  | { kind: "annual"; value: number }
  | { kind: "cdi"; pct: number; cdiAnnual: number }
  | { kind: "ipca"; spread: number; ipcaAnnual: number };

/** Simulator modes (doc 02 §6.11): Quanto terei · Quanto investir · Em quanto tempo. */
export type SimulationMode =
  | "future_value"
  | "required_monthly"
  | "time_to_target";

/**
 * simulations.params: the `SimulationInput` of doc 03 §4 (amounts in reais,
 * not cents) plus the mode and target, so a saved simulation reopens as it was.
 */
export type SimulationParams = {
  initial: number;
  monthly: number;
  months: number;
  rate: SimulationRate;
  timing?: "start" | "end";
  contributionGrowthAnnual?: number;
  inflationAnnual?: number;
  tax?: "none" | "regressive" | "exempt";
  mode: SimulationMode;
  /** Target amount in reais, used by the reverse modes. */
  target?: number;
};

/** imports.stats */
export type ImportStats = {
  rows: number;
  duplicates: number;
  imported: number;
};

/**
 * notifications.payload: the data needed to render the message when it is
 * shown. `type` repeats notifications.type so the payload narrows on its own.
 * Dates are ISO `YYYY-MM-DD`; money is in cents.
 */
export type NotificationPayload =
  | {
      type: "bill_due";
      transactionId: string;
      description: string;
      amountCents: number;
      dueOn: string;
    }
  | {
      type: "invoice_closing";
      invoiceId: string;
      accountId: string;
      accountName: string;
      closingOn: string;
      totalCents: number;
    }
  | {
      type: "budget_80" | "budget_100";
      budgetId: string;
      categoryId: string;
      categoryName: string;
      month: string;
      spentCents: number;
      budgetCents: number;
    }
  | { type: "goal_reached"; goalId: string; goalName: string }
  | {
      type: "insight";
      key: string;
      title: string;
      body: string;
      href?: string;
    };

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * One step of a scheduled job (doc 01 §9). Matches the report built by
 * src/server/jobs/runner.ts.
 */
export type JobStepReport = {
  name: string;
  status: "ok" | "partial" | "failed" | "skipped";
  durationMs: number;
  /** Counters and resume points reported by the step. */
  details?: { [key: string]: JsonValue };
  /** Why the step was skipped (pt-BR, shown to the owner). */
  reason?: string;
  /** Failure message, without personal data or query parameters. */
  error?: string;
};

/** job_runs.report */
export type JobRunReport = { durationMs: number; steps: JobStepReport[] };

/**
 * audit_log.metadata: the details of an action that the sentence in
 * Administração › Atividade needs. Never a token, a password, a session or
 * financial data.
 */
export type AuditMetadata = {
  /** The account's role after user.created / user.role_changed. */
  role?: "admin" | "user";
  /** access_link.*: invite (first password) or reset. */
  purpose?: "invite" | "reset";
  /** access_link.created: a link that still worked stopped working. */
  replaced?: boolean;
  /** access_link.accepted (reset): the person also removed their passkeys. */
  removedPasskeys?: boolean;
  /** user.sessions_revoked, user.banned: how many sessions ended. */
  sessions?: number;
  /** flag.*: the registry key. */
  flag?: string;
  /** flag.*: on, off, or null for back to the default. */
  value?: boolean | null;
};
