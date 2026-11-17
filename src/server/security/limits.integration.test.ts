// Per-person limits on the costly actions (docs/04-seguranca.md, M-4) against
// in-memory PGlite: each rule blocks after its max and people do not share a
// counter.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Limits = typeof import("./limits");
let m: Limits;

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("@/server/db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  m = await import("./limits");
}, 120_000);

describe("limitUsage", () => {
  it.each([
    ["importAnalyze", 20],
    ["importConfirm", 10],
    ["entryText", 30],
    ["exportCsv", 10],
  ] as const)("%s allows %i uses and then blocks", async (name, max) => {
    expect(m.USAGE_LIMITS[name].max).toBe(max);
    const user = `user-${name}`;
    for (let i = 0; i < max; i++) {
      expect((await m.limitUsage(name, user)).ok).toBe(true);
    }
    const blocked = await m.limitUsage(name, user);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(
        m.USAGE_LIMITS[name].windowSeconds,
      );
    }
  });

  it("keeps one person's block from touching another person or rule", async () => {
    for (let i = 0; i <= 10; i++) await m.limitUsage("exportCsv", "ana");
    expect((await m.limitUsage("exportCsv", "ana")).ok).toBe(false);
    expect((await m.limitUsage("exportCsv", "bia")).ok).toBe(true);
    expect((await m.limitUsage("importConfirm", "ana")).ok).toBe(true);
  });
});
