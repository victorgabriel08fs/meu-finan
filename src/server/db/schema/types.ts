// Shapes stored in jsonb columns. Writers validate them with Zod before saving;
// these types only describe what is persisted. Rates are decimals (0.1 = 10%).
import type { ReminderNotificationType, ShareSplitMethod } from "./enums";

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

/**
 * share_groups.default_split: how a new expense of the group is divided until
 * someone changes it. `inputs` maps share_members.id to the input of the
 * method (see SplitInput in src/lib/finance/split.ts); members missing from
 * it take part with the method's default.
 */
export type ShareDefaultSplit = {
  method: ShareSplitMethod;
  inputs: { [memberId: string]: number };
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
    }
  | {
      /** A notice of the daily job, as it was sent (amounts only if shown). */
      type: ReminderNotificationType;
      /** The person's local date it was sent for. */
      date: string;
      title: string;
      body: string;
      url: string;
      /**
       * bills_due and non_business_due: the bills it announced (see
       * selectBillReminders and selectNonBusinessDueReminders).
       */
      itemKeys?: string[];
      /**
       * Whether the title or body carry money, as sent (`showAmounts`). Rows
       * without it count as "may carry amounts".
       */
      amounts?: boolean;
    }
  // What a group tells its members (ADR-13). Names are snapshots taken when
  // the notice is recorded; `amounts` says whether the body carries money.
  | {
      type: "share_invite";
      groupId: string;
      /** share_members.id of the invite: Aceitar and Recusar answer it. */
      memberId: string;
      groupName: string;
      inviterName: string;
      inviterEmail: string;
      amounts?: false;
    }
  | {
      type: "share_joined" | "share_declined" | "share_left";
      groupId: string;
      groupName: string;
      /** Who joined, declined or left. */
      memberName: string;
      amounts?: false;
    }
  | {
      type: "share_removed";
      groupId: string;
      groupName: string;
      /** The owner who took the person out. */
      actorName: string;
      amounts?: false;
    }
  | {
      /**
       * One a day per member who changed the group's expenses: the counts
       * and sums add up (bumpNotification). `description` is the last one
       * added, shown only when it is the single change of the day.
       */
      type: "shared_activity";
      groupId: string;
      groupName: string;
      actorName: string;
      added: number;
      addedCents: number;
      /** The recipient's parts of what was added. */
      myShareCents: number;
      changed: number;
      removed: number;
      description?: string;
      amounts?: true;
    }
  | {
      type: "share_settled";
      groupId: string;
      groupName: string;
      actorName: string;
      settlementId: string;
      amountCents: number;
      /** Seen from the recipient: the actor paid them, or they paid the actor. */
      direction: "paid_you" | "you_paid";
      date: string;
      amounts?: true;
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
export type JobRunReport = {
  durationMs: number;
  steps: JobStepReport[];
  /** Who started the run; absent in runs recorded before it was kept. */
  trigger?: "cron" | "manual" | "admin";
  /** A call refused before running anything: no steps. */
  rejected?: "unauthorized";
};

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
  /** job.run_manual: which job. */
  job?: string;
  /** share.invited: the e-mail has no account (kept out of the entry). */
  unresolved?: boolean;
};
