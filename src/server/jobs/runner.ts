import { uuidv7 } from "uuidv7";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** What a step returns. Throwing marks the step as failed. */
export type StepResult =
  | { status: "ok"; details?: JsonObject }
  /** Some of the work failed and the rest was kept. */
  | { status: "partial"; error: string; details?: JsonObject }
  /** Nothing to do, e.g. a step that belongs to a later phase. `reason` is shown to the owner (pt-BR). */
  | { status: "skipped"; reason: string };

export interface StepContext {
  /** Aborted when the run's time budget is exhausted; pass it to fetch and other I/O. */
  signal: AbortSignal;
  /** When the run started; use it as "now" so every step agrees on the date. */
  startedAt: Date;
}

export interface JobStep {
  name: string;
  run: (context: StepContext) => Promise<StepResult>;
}

export type StepStatus = "ok" | "partial" | "failed" | "skipped";
export type JobRunStatus = "ok" | "partial" | "failed";

export interface StepReport {
  name: string;
  status: StepStatus;
  durationMs: number;
  details?: JsonObject;
  reason?: string;
  error?: string;
}

/** Stored in job_runs.report. */
export interface JobRunReport {
  durationMs: number;
  steps: StepReport[];
}

export interface JobRunSummary extends JobRunReport {
  runId: string;
  job: string;
  status: JobRunStatus;
  startedAt: string;
  finishedAt: string;
  /** Whether the job_runs row was written; the steps run even when it was not. */
  recorded: boolean;
}

export interface JobRunStart {
  id: string;
  job: string;
  startedAt: Date;
}

export interface JobRunFinish extends JobRunStart {
  finishedAt: Date;
  status: JobRunStatus;
  report: JobRunReport;
}

/** Persistence of job_runs. `finish` must upsert, so a run is recorded even if `start` failed. */
export interface JobRunStore {
  start(run: JobRunStart): Promise<void>;
  finish(run: JobRunFinish): Promise<void>;
}

export interface RunJobOptions {
  job: string;
  steps: readonly JobStep[];
  store: JobRunStore;
  /** No step starts after this many milliseconds, and a running step is abandoned. */
  budgetMs: number;
  newId?: () => string;
  logger?: Pick<Console, "error">;
}

/**
 * Runs the steps in order, isolating failures: a step that throws, or outlives
 * the time budget, is reported as failed and the next one still runs. The run
 * is "ok" when every step that ran succeeded, "failed" when all of them failed
 * and "partial" otherwise. Skipped steps do not count either way.
 */
export async function runJob(options: RunJobOptions): Promise<JobRunSummary> {
  const { job, steps, store, budgetMs } = options;
  const logger = options.logger ?? console;
  const id = (options.newId ?? uuidv7)();
  const startedAt = new Date();
  const startTick = performance.now();
  const budget = AbortSignal.timeout(budgetMs);
  const deadline = startedAt.getTime() + budgetMs;

  let recorded = false;
  try {
    await store.start({ id, job, startedAt });
  } catch (error) {
    logger.error(
      `[jobs] ${job}: could not record the start of run ${id}`,
      error,
    );
  }

  const reports: StepReport[] = [];
  for (const step of steps) {
    if (budget.aborted || Date.now() >= deadline) {
      reports.push({
        name: step.name,
        status: "failed",
        durationMs: 0,
        error: `Not started: time budget of ${budgetMs} ms exhausted`,
      });
      continue;
    }
    reports.push(
      await runStep(step, { signal: budget, startedAt }, budgetMs, logger),
    );
  }

  const finishedAt = new Date();
  const status = aggregateStatus(reports);
  const report: JobRunReport = {
    durationMs: elapsedMs(startTick),
    steps: reports,
  };
  try {
    await store.finish({ id, job, startedAt, finishedAt, status, report });
    recorded = true;
  } catch (error) {
    logger.error(`[jobs] ${job}: could not record the end of run ${id}`, error);
  }

  return {
    runId: id,
    job,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    recorded,
    ...report,
  };
}

async function runStep(
  step: JobStep,
  context: StepContext,
  budgetMs: number,
  logger: Pick<Console, "error">,
): Promise<StepReport> {
  const startTick = performance.now();
  try {
    const result = await untilAborted(
      step.run(context),
      context.signal,
      budgetMs,
    );
    const durationMs = elapsedMs(startTick);
    switch (result.status) {
      case "ok":
        return {
          name: step.name,
          status: "ok",
          durationMs,
          ...withDetails(result.details),
        };
      case "partial":
        return {
          name: step.name,
          status: "partial",
          durationMs,
          error: result.error,
          ...withDetails(result.details),
        };
      case "skipped":
        return {
          name: step.name,
          status: "skipped",
          durationMs,
          reason: result.reason,
        };
    }
  } catch (error) {
    logger.error(`[jobs] step ${step.name} failed`, error);
    return {
      name: step.name,
      status: "failed",
      durationMs: elapsedMs(startTick),
      error: describeError(error),
    };
  }
}

/** Settles with `work`, or rejects as soon as the budget runs out (the step is abandoned). */
function untilAborted<T>(
  work: Promise<T>,
  signal: AbortSignal,
  budgetMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(new Error(`Time budget of ${budgetMs} ms exhausted`));
    if (signal.aborted) onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function aggregateStatus(steps: readonly StepReport[]): JobRunStatus {
  const ran = steps.filter((step) => step.status !== "skipped");
  if (ran.every((step) => step.status === "ok")) return "ok";
  if (ran.every((step) => step.status === "failed")) return "failed";
  return "partial";
}

/**
 * One line per error in the `cause` chain, first line of each message only:
 * Drizzle puts the query parameters on the second line of its errors, and the
 * report must not carry data values.
 */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 4 && current !== undefined && current !== null;
    depth += 1
  ) {
    if (current instanceof Error) {
      const firstLine = current.message.split("\n", 1)[0] ?? "";
      parts.push(truncate(`${current.name}: ${firstLine}`, 240));
      current = current.cause;
    } else {
      parts.push(truncate(String(current), 240));
      break;
    }
  }
  return parts.length > 0 ? parts.join(" <- ") : "Unknown error";
}

function withDetails(details: JsonObject | undefined): {
  details?: JsonObject;
} {
  return details ? { details } : {};
}

function elapsedMs(startTick: number): number {
  return Math.round(performance.now() - startTick);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
