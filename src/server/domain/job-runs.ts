// Administração › Rotina diária (doc 01 §9, §11.9): the runs of the daily job,
// what the screen needs to know about its setup, and "Rodar agora". Only for
// administrators (the page and the action check; runDailyNow checks again).
// Nothing here reads a person's finances, and the secret's value never leaves
// the server: only whether it is set.
import { and, desc, eq, gt } from "drizzle-orm";
import { hasAdminRole } from "@/lib/admin/roles";
import { availableReminderEvents } from "@/lib/notifications/preferences";
import { db } from "@/server/db/client";
import { jobRuns, user } from "@/server/db/schema";
import { readServerEnv } from "@/server/env";
import { loadFlagsForUsers } from "@/server/flags";
import { DAILY_JOB, runDailyJob } from "@/server/jobs/daily";
import type { JobRunStatus } from "@/server/jobs/runner";
import { vapidKeys } from "@/server/push";
import { throttle } from "@/server/security/throttle";
import { recordAudit } from "./audit";
import { DomainError, NOT_ALLOWED } from "./errors";
import { listReminderRecipients } from "./reminders";

export type RoutineRunItem = {
  id: string;
  status: "running" | JobRunStatus;
  /** ISO timestamps. */
  startedAt: string;
  finishedAt: string | null;
  report: (typeof jobRuns.$inferSelect)["report"];
};

export const ROUTINE_RUNS_LIMIT = 14;

/** Newest first. */
export async function listDailyRuns(
  limit: number = ROUTINE_RUNS_LIMIT,
): Promise<RoutineRunItem[]> {
  const rows = await db
    .select()
    .from(jobRuns)
    .where(eq(jobRuns.job, DAILY_JOB))
    .orderBy(desc(jobRuns.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    report: row.report,
  }));
}

export type RoutineConfig = {
  /** CRON_SECRET is set (and valid). Without it the cron is refused. */
  cronSecretSet: boolean;
  /** The VAPID keys are set. Without them the notices step is skipped. */
  vapidSet: boolean;
  /** People with the flag, a device and at least one notice on. */
  recipients: number;
};

function isSet(read: () => unknown): boolean {
  try {
    return Boolean(read());
  } catch {
    return false;
  }
}

export async function routineConfig(): Promise<RoutineConfig> {
  const candidates = await listReminderRecipients();
  const flags = await loadFlagsForUsers(
    candidates.map((candidate) => candidate.userId),
  );
  const recipients = candidates.filter(
    (candidate) =>
      flags.get(candidate.userId)?.notificacoes_push &&
      availableReminderEvents(candidate.preferences, {
        nonBusinessDue:
          flags.get(candidate.userId)?.alerta_dia_nao_util ?? false,
      }).length > 0,
  ).length;
  return {
    cronSecretSet: isSet(() => readServerEnv("CRON_SECRET")),
    vapidSet: isSet(() => vapidKeys()),
    recipients,
  };
}

/** A run recorded as running this recently is taken as still going. */
const RUNNING_WINDOW_MS = 5 * 60_000;
const RUN_THROTTLE = { windowSeconds: 120, max: 1 } as const;

export type RunNowResult = {
  runId: string;
  status: JobRunStatus;
  recorded: boolean;
};

/**
 * "Rodar agora": the whole daily job, started by an administrator. Refuses
 * while another run is going and more than once in two minutes (the notices
 * and the rates are safe to repeat, but nobody needs it every second). The
 * audit entry is written before the run, so even a run that dies is on record.
 */
export async function runDailyNow(adminId: string): Promise<RunNowResult> {
  const [actor] = await db
    .select({
      id: user.id,
      name: user.name,
      role: user.role,
      banned: user.banned,
    })
    .from(user)
    .where(eq(user.id, adminId));
  if (!actor || actor.banned || !hasAdminRole(actor.role)) {
    throw new DomainError(NOT_ALLOWED);
  }

  const [going] = await db
    .select({ id: jobRuns.id })
    .from(jobRuns)
    .where(
      and(
        eq(jobRuns.job, DAILY_JOB),
        eq(jobRuns.status, "running"),
        gt(jobRuns.startedAt, new Date(Date.now() - RUNNING_WINDOW_MS)),
      ),
    )
    .limit(1);
  if (going) {
    throw new DomainError("Já tem uma execução em andamento. Espere terminar.");
  }

  const allowed = await throttle("job-daily-run", RUN_THROTTLE);
  if (!allowed.ok) {
    throw new DomainError(
      `A rotina rodou há pouco. Espere ${allowed.retryAfterSeconds} s para rodar de novo.`,
    );
  }

  await recordAudit(db, {
    action: "job.run_manual",
    actor: { id: actor.id, name: actor.name },
    metadata: { job: DAILY_JOB },
  });

  const summary = await runDailyJob({ trigger: "admin" });
  return {
    runId: summary.runId,
    status: summary.status,
    recorded: summary.recorded,
  };
}
