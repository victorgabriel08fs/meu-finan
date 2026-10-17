// The theme preference against a real (in-memory) Postgres: the column
// default, the migration that moved old rows to dark, the domain functions
// and the Server Action with a mocked session.
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/server/dal", () => ({
  requireUser: mocks.requireUser,
  getSession: vi.fn(),
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
process.env.DATABASE_URL = "pglite:memory";

type Modules = {
  db: typeof import("../db/client")["db"];
  schema: typeof import("../db/schema");
  preferences: typeof import("./preferences");
  action: typeof import("../actions/preferences")["setThemeAction"];
  sql: typeof import("drizzle-orm")["sql"];
  eq: typeof import("drizzle-orm")["eq"];
};
let m: Modules;

const OWNER = { id: "owner", name: "Ana", email: "ana@exemplo.com" };

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { db } = await import("../db/client");
  await migrate(db as never, { migrationsFolder: "drizzle" });
  const schema = await import("../db/schema");
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  await db
    .insert(schema.user)
    .values([
      OWNER,
      { id: "outro", name: "Outro", email: "outro@exemplo.com" },
    ]);
  await ensureOwnerDefaults("owner");
  const { eq, sql } = await import("drizzle-orm");
  m = {
    db,
    schema,
    preferences: await import("./preferences"),
    action: (await import("../actions/preferences")).setThemeAction,
    sql,
    eq,
  };
}, 120_000);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(OWNER);
});

const storedTheme = async (userId: string) => {
  const [row] = await m.db
    .select({ theme: m.schema.userSettings.theme })
    .from(m.schema.userSettings)
    .where(m.eq(m.schema.userSettings.userId, userId));
  return row?.theme;
};

describe("theme preference", () => {
  it("starts dark for a new owner", async () => {
    expect(await storedTheme("owner")).toBe("dark");
    expect(await m.preferences.getThemePreference("owner")).toBe("dark");
  });

  it("is dark without a settings row", async () => {
    expect(await storedTheme("outro")).toBeUndefined();
    expect(await m.preferences.getThemePreference("outro")).toBe("dark");
  });

  it("saves each choice on the account", async () => {
    for (const theme of ["light", "system", "dark"] as const) {
      await m.preferences.setThemePreference("owner", theme);
      expect(await m.preferences.getThemePreference("owner")).toBe(theme);
    }
  });

  it("creates the settings row when it is missing", async () => {
    await m.preferences.setThemePreference("outro", "light");
    expect(await storedTheme("outro")).toBe("light");
    await m.preferences.setThemePreference("outro", "dark");
    expect(await storedTheme("outro")).toBe("dark");
  });

  it("refuses a theme the database does not know", async () => {
    await expect(
      m.db.execute(
        m.sql`update user_settings set theme = 'sepia' where user_id = 'owner'`,
      ),
    ).rejects.toThrow();
  });

  it("moved the rows of the old default to dark, and only those", async () => {
    // The custom migration, replayed on rows as they were before it ran.
    // Found by its tag, so renumbering the migrations does not break it.
    await m.preferences.setThemePreference("owner", "system");
    await m.preferences.setThemePreference("outro", "light");
    const journal = JSON.parse(
      readFileSync("drizzle/meta/_journal.json", "utf8"),
    ) as { entries: { tag: string }[] };
    const entry = journal.entries.find((item) =>
      item.tag.endsWith("_theme_dark_existing_rows"),
    );
    expect(entry).toBeDefined();
    const migration = readFileSync(`drizzle/${entry?.tag}.sql`, "utf8");
    await m.db.execute(m.sql.raw(migration));
    expect(await storedTheme("owner")).toBe("dark");
    expect(await storedTheme("outro")).toBe("light");
  });
});

describe("setThemeAction", () => {
  it("saves the session owner's theme and refreshes the page", async () => {
    const result = await m.action({ theme: "light" });
    expect(result.serverError).toBeUndefined();
    expect(result.validationErrors).toBeUndefined();
    expect(await storedTheme("owner")).toBe("light");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("validates the theme", async () => {
    await m.preferences.setThemePreference("owner", "dark");
    const result = await m.action({ theme: "sepia" as never });
    expect(result.validationErrors).toBeDefined();
    expect(await storedTheme("owner")).toBe("dark");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("never takes the user from the client", async () => {
    await m.preferences.setThemePreference("outro", "light");
    const result = await m.action({
      theme: "system",
      userId: "outro",
    } as never);
    expect(result.serverError).toBeUndefined();
    expect(await storedTheme("owner")).toBe("system");
    expect(await storedTheme("outro")).toBe("light");
  });

  it("writes nothing without a session", async () => {
    await m.preferences.setThemePreference("owner", "dark");
    mocks.requireUser.mockRejectedValue(new Error("no session"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await m.action({ theme: "light" });
    error.mockRestore();
    expect(result.serverError).toBeDefined();
    expect(await storedTheme("owner")).toBe("dark");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
