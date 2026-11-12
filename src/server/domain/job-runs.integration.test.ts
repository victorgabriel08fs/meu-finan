// Administração › Rotina diária against a real (in-memory) Postgres: the
// list of runs, the setup read without leaking the secret, "Rodar agora"
// (admin only, one at a time, throttled, audited) and the cron route marking
// who called and recording a refused call from Vercel.
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
// runDailyJob also syncs the market rates and the holidays: no network in the tests.
vi.mock("../jobs/bcb-sgs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../jobs/bcb-sgs")>()),
  fetchSgsSeries: async () => {
    throw new Error("offline");
  },
}));
vi.mock("../jobs/brasilapi-holidays", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../jobs/brasilapi-holidays")>()),
  fetchHolidays: async () => {
    throw new Error("offline");
  },
}));
vi.mock("@/server/dal", () => ({
  requireUser: async () => null,
  getAdmin: async () => null,
  getSession: async () => null,
}));

process.env.DATABASE_URL = "pglite:memory";
const SECRET = "segredo-do-cron-0123456789abcdef0123456789";
process.env.CRON_SECRET = SECRET;

type Modules = {
  db: typeof import("../db/client")["db"];
  schema: typeof import("../db/schema");
  jobRuns: typeof import("./job-runs");
  route: typeof import("../../app/api/cron/daily/route");
};
let m: Modules;

const NOT_ALLOWED = "Você não tem permissão para fazer isso.";

const cronCall = (headers: Record<string, string>) =>
  m.route.GET(new Request("http://localhost/api/cron/daily", { headers }));
const runsOf = () =>
  m.db.select().from(m.schema.jobRuns).orderBy(m.schema.jobRuns.startedAt);

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("../db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("../db/schema");
  await client.db.insert(schema.user).values([
    { id: "ana", name: "Ana", email: "ana@exemplo.com", role: "admin" },
    { id: "bruno", name: "Bruno", email: "bruno@exemplo.com" },
  ]);
  m = {
    db: client.db,
    schema,
    jobRuns: await import("./job-runs"),
    route: await import("../../app/api/cron/daily/route"),
  };
}, 120_000);

beforeEach(async () => {
  await m.db.delete(m.schema.jobRuns);
  await m.db.delete(m.schema.auditLog);
  await m.db.delete(m.schema.rateLimit);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("listDailyRuns", () => {
  it("returns only the daily job, newest first, up to the limit", async () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 10, 9, 9, minute));
    for (const [id, job, minute] of [
      ["00000000-0000-7000-8000-00000000000a", "daily", 1],
      ["00000000-0000-7000-8000-00000000000b", "daily", 2],
      ["00000000-0000-7000-8000-00000000000c", "other", 3],
      ["00000000-0000-7000-8000-00000000000d", "daily", 4],
    ] as const) {
      await m.db.insert(m.schema.jobRuns).values({
        id,
        job,
        startedAt: at(minute),
        finishedAt: at(minute),
        status: "ok",
        report: { durationMs: 1, steps: [] },
      });
    }
    const all = await m.jobRuns.listDailyRuns();
    expect(all.map((run) => run.id)).toEqual([
      "00000000-0000-7000-8000-00000000000d",
      "00000000-0000-7000-8000-00000000000b",
      "00000000-0000-7000-8000-00000000000a",
    ]);
    const two = await m.jobRuns.listDailyRuns(2);
    expect(two.map((run) => run.id)).toEqual([
      "00000000-0000-7000-8000-00000000000d",
      "00000000-0000-7000-8000-00000000000b",
    ]);
    expect(typeof all[0]?.startedAt).toBe("string");
  });
});

describe("routineConfig", () => {
  it("tells whether the secret is set, never its value", async () => {
    const config = await m.jobRuns.routineConfig();
    expect(config).toEqual({
      cronSecretSet: true,
      vapidSet: false,
      recipients: 0,
    });
    expect(JSON.stringify(config)).not.toContain(SECRET);

    vi.stubEnv("CRON_SECRET", "");
    expect((await m.jobRuns.routineConfig()).cronSecretSet).toBe(false);
    vi.stubEnv("CRON_SECRET", SECRET);
  });

  it("counts people with the flag, a device and a notice on", async () => {
    await m.db.insert(m.schema.featureFlagOverrides).values({
      userId: "ana",
      key: "notificacoes_push",
      enabled: true,
    });
    await m.db.insert(m.schema.pushSubscriptions).values([
      {
        userId: "ana",
        endpoint: "https://push.example/ana",
        p256dh: "x",
        auth: "y",
      },
      {
        userId: "bruno",
        endpoint: "https://push.example/bruno",
        p256dh: "x",
        auth: "y",
      },
    ]);
    try {
      // Bruno has a device but not the flag.
      expect((await m.jobRuns.routineConfig()).recipients).toBe(1);
    } finally {
      await m.db.delete(m.schema.pushSubscriptions);
      await m.db.delete(m.schema.featureFlagOverrides);
    }
  });
});

describe("runDailyNow", () => {
  it("refuses a non-administrator without writing anything", async () => {
    await expect(m.jobRuns.runDailyNow("bruno")).rejects.toThrow(NOT_ALLOWED);
    await expect(m.jobRuns.runDailyNow("ninguem")).rejects.toThrow(NOT_ALLOWED);
    expect(await runsOf()).toEqual([]);
    expect(await m.db.select().from(m.schema.auditLog)).toEqual([]);
  });

  it("runs as the admin, records the origin and audits without secrets", async () => {
    const result = await m.jobRuns.runDailyNow("ana");
    expect(result.recorded).toBe(true);
    const [row] = await runsOf();
    expect(row?.id).toBe(result.runId);
    expect(row?.report?.trigger).toBe("admin");
    expect(row?.status).toBe(result.status);
    // The holiday sync is a step of the daily job (offline here: it fails, the rest runs).
    const names = (row?.report?.steps ?? []).map((step) => step.name);
    expect(names).toContain("syncHolidays");
    expect(names.indexOf("syncHolidays")).toBeLessThan(
      names.indexOf("sendReminders"),
    );

    const audit = await m.db.select().from(m.schema.auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "job.run_manual",
      actorId: "ana",
      actorName: "Ana",
      targetUserId: null,
      metadata: { job: "daily" },
    });
    expect(JSON.stringify(audit)).not.toContain(SECRET);
  });

  it("refuses a second run within two minutes, without a new audit entry", async () => {
    await m.jobRuns.runDailyNow("ana");
    await expect(m.jobRuns.runDailyNow("ana")).rejects.toThrow(
      /A rotina rodou há pouco\. Espere \d+ s para rodar de novo\./,
    );
    expect(await runsOf()).toHaveLength(1);
    expect(await m.db.select().from(m.schema.auditLog)).toHaveLength(1);
  });

  it("refuses while another run is going, but not a dead one", async () => {
    await m.db.insert(m.schema.jobRuns).values({
      job: "daily",
      status: "running",
      startedAt: new Date(Date.now() - 60_000),
    });
    await expect(m.jobRuns.runDailyNow("ana")).rejects.toThrow(
      "Já tem uma execução em andamento. Espere terminar.",
    );
    expect(await m.db.select().from(m.schema.auditLog)).toEqual([]);

    await m.db
      .update(m.schema.jobRuns)
      .set({ startedAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(m.schema.jobRuns.status, "running"));
    await expect(m.jobRuns.runDailyNow("ana")).resolves.toMatchObject({
      recorded: true,
    });
  });
});

describe("the cron route", () => {
  it("answers 401 without writing a row when it was not Vercel", async () => {
    expect((await cronCall({})).status).toBe(401);
    expect((await cronCall({ authorization: "Bearer errado" })).status).toBe(
      401,
    );
    expect(await runsOf()).toEqual([]);
  });

  it("records a refused call from Vercel, once an hour", async () => {
    const headers = { "user-agent": "vercel-cron/1.0" };
    expect((await cronCall(headers)).status).toBe(401);
    expect((await cronCall(headers)).status).toBe(401);
    const rows = await runsOf();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      job: "daily",
      status: "failed",
      report: {
        durationMs: 0,
        steps: [],
        trigger: "cron",
        rejected: "unauthorized",
      },
    });
    expect(JSON.stringify(rows)).not.toContain("vercel-cron");
  });

  it("marks a Vercel call as cron and any other as manual", async () => {
    const authorization = `Bearer ${SECRET}`;
    const fromVercel = await cronCall({
      authorization,
      "user-agent": "vercel-cron/1.0",
    });
    expect(fromVercel.status).not.toBe(401);
    const byHand = await cronCall({ authorization });
    expect(byHand.status).not.toBe(401);
    const rows = await runsOf();
    expect(rows.map((row) => row.report?.trigger)).toEqual(["cron", "manual"]);
  });
});
