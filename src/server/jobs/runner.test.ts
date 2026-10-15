import { describe, expect, it, vi } from "vitest";
import {
  aggregateStatus,
  describeError,
  type JobRunFinish,
  type JobRunStart,
  type JobRunStore,
  type JobStep,
  runJob,
  type StepContext,
  type StepReport,
} from "./runner";

function memoryStore(overrides: Partial<JobRunStore> = {}) {
  const started: JobRunStart[] = [];
  const finished: JobRunFinish[] = [];
  const store: JobRunStore = {
    start: async (run) => {
      started.push(run);
    },
    finish: async (run) => {
      finished.push(run);
    },
    ...overrides,
  };
  return { store, started, finished };
}

const silent = { error: vi.fn() };

const ok = (name: string, details?: Record<string, number>): JobStep => ({
  name,
  run: async () => ({ status: "ok", details }),
});
const failing = (name: string, message = "boom"): JobStep => ({
  name,
  run: async () => {
    throw new Error(message);
  },
});
const skipped = (name: string): JobStep => ({
  name,
  run: async () => ({ status: "skipped", reason: "Chega na fase F2." }),
});

describe("runJob", () => {
  it("records a successful run from start to finish", async () => {
    const { store, started, finished } = memoryStore();

    const summary = await runJob({
      job: "daily",
      steps: [ok("a", { rows: 3 }), skipped("b")],
      store,
      budgetMs: 10_000,
      newId: () => "run-1",
      logger: silent,
    });

    expect(summary).toMatchObject({
      runId: "run-1",
      job: "daily",
      status: "ok",
      recorded: true,
    });
    expect(summary.steps).toEqual([
      expect.objectContaining({
        name: "a",
        status: "ok",
        details: { rows: 3 },
      }),
      expect.objectContaining({
        name: "b",
        status: "skipped",
        reason: "Chega na fase F2.",
      }),
    ]);
    expect(started).toEqual([
      { id: "run-1", job: "daily", startedAt: expect.any(Date) },
    ]);
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({
      id: "run-1",
      status: "ok",
      report: { steps: summary.steps },
    });
    for (const step of summary.steps)
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("isolates a failing step and keeps running the next ones", async () => {
    const { store } = memoryStore();
    const after = vi.fn(async () => ({ status: "ok" as const }));

    const summary = await runJob({
      job: "daily",
      steps: [failing("first", "network down"), { name: "second", run: after }],
      store,
      budgetMs: 10_000,
      logger: silent,
    });

    expect(after).toHaveBeenCalledOnce();
    expect(summary.status).toBe("partial");
    expect(summary.steps[0]).toMatchObject({
      status: "failed",
      error: "Error: network down",
    });
  });

  it("is failed when every step that ran failed", async () => {
    const { store } = memoryStore();

    const summary = await runJob({
      job: "daily",
      steps: [failing("a"), skipped("b"), failing("c")],
      store,
      budgetMs: 10_000,
      logger: silent,
    });

    expect(summary.status).toBe("failed");
  });

  it("passes the run start and the budget signal to every step", async () => {
    const { store } = memoryStore();
    const run = vi.fn(async (_context: StepContext) => ({
      status: "ok" as const,
    }));

    const summary = await runJob({
      job: "daily",
      steps: [{ name: "a", run }],
      store,
      budgetMs: 10_000,
    });

    expect(run).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
      startedAt: expect.any(Date),
    });
    expect(summary.startedAt).toBe(
      run.mock.calls[0]?.[0].startedAt.toISOString(),
    );
  });

  it("abandons a step that outlives the budget and does not start the rest", async () => {
    const { store } = memoryStore();
    const never: JobStep = { name: "slow", run: () => new Promise(() => {}) };
    const next = vi.fn(async () => ({ status: "ok" as const }));

    const summary = await runJob({
      job: "daily",
      steps: [never, { name: "next", run: next }],
      store,
      budgetMs: 25,
      logger: silent,
    });

    expect(next).not.toHaveBeenCalled();
    expect(summary.status).toBe("failed");
    expect(summary.steps).toEqual([
      expect.objectContaining({
        name: "slow",
        status: "failed",
        error: "Error: Time budget of 25 ms exhausted",
      }),
      expect.objectContaining({
        name: "next",
        status: "failed",
        error: expect.stringMatching(/^Not started/),
      }),
    ]);
  });

  it("reports partial results returned by a step", async () => {
    const { store } = memoryStore();
    const partial: JobStep = {
      name: "rates",
      run: async () => ({
        status: "partial",
        error: "ipca: HTTP 503",
        details: { changed: 2 },
      }),
    };

    const summary = await runJob({
      job: "daily",
      steps: [partial, ok("purge")],
      store,
      budgetMs: 10_000,
    });

    expect(summary.status).toBe("partial");
    expect(summary.steps[0]).toMatchObject({
      status: "partial",
      error: "ipca: HTTP 503",
      details: { changed: 2 },
    });
  });

  it("still runs the steps and records the end when the start could not be stored", async () => {
    const { store, finished } = memoryStore({
      start: async () => {
        throw new Error("database unreachable");
      },
    });

    const summary = await runJob({
      job: "daily",
      steps: [ok("a")],
      store,
      budgetMs: 10_000,
      logger: silent,
    });

    expect(summary).toMatchObject({ status: "ok", recorded: true });
    expect(finished).toHaveLength(1);
  });

  it("never throws when the run cannot be recorded at all", async () => {
    const unavailable = async () => {
      throw new Error("database unreachable");
    };
    const logger = { error: vi.fn() };

    const summary = await runJob({
      job: "daily",
      steps: [ok("a")],
      store: { start: unavailable, finish: unavailable },
      budgetMs: 10_000,
      logger,
    });

    expect(summary).toMatchObject({ status: "ok", recorded: false });
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});

describe("aggregateStatus", () => {
  const report = (status: StepReport["status"]): StepReport => ({
    name: status,
    status,
    durationMs: 0,
  });

  it("ignores skipped steps", () => {
    expect(aggregateStatus([])).toBe("ok");
    expect(aggregateStatus([report("skipped")])).toBe("ok");
    expect(aggregateStatus([report("ok"), report("skipped")])).toBe("ok");
    expect(aggregateStatus([report("failed"), report("skipped")])).toBe(
      "failed",
    );
  });

  it("is partial for any mix of success and failure", () => {
    expect(aggregateStatus([report("ok"), report("failed")])).toBe("partial");
    expect(aggregateStatus([report("partial")])).toBe("partial");
    expect(aggregateStatus([report("partial"), report("failed")])).toBe(
      "partial",
    );
  });
});

describe("describeError", () => {
  it("follows the cause chain", () => {
    const error = new TypeError("fetch failed", {
      cause: new Error("connect ETIMEDOUT"),
    });
    expect(describeError(error)).toBe(
      "TypeError: fetch failed <- Error: connect ETIMEDOUT",
    );
  });

  it("drops everything after the first line, where Drizzle puts query parameters", () => {
    const error = new Error(
      'Failed query: delete from "transactions"\nparams: secret-value',
      {
        cause: new Error('relation "transactions" does not exist'),
      },
    );
    const described = describeError(error);
    expect(described).not.toContain("secret-value");
    expect(described).toBe(
      'Error: Failed query: delete from "transactions" <- Error: relation "transactions" does not exist',
    );
  });

  it("handles values that are not errors", () => {
    expect(describeError("plain string")).toBe("plain string");
    expect(describeError(undefined)).toBe("Unknown error");
  });
});
