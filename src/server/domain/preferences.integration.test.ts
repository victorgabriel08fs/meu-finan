// Preferences against a real (in-memory) Postgres, with a mocked session.
// The theme: the column default, the migration that moved old rows to dark,
// the domain functions and the Server Action. The Início: the stored blocks,
// the check on the column and the action behind inicio_personalizavel.
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
  saveHomeLayout: typeof import("../actions/preferences")["saveHomeLayoutAction"];
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
    saveHomeLayout: (await import("../actions/preferences"))
      .saveHomeLayoutAction,
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

const OUTRO = { id: "outro", name: "Outro", email: "outro@exemplo.com" };

const storedHomeLayout = async (userId: string) => {
  const [row] = await m.db
    .select({ homeLayout: m.schema.userSettings.homeLayout })
    .from(m.schema.userSettings)
    .where(m.eq(m.schema.userSettings.userId, userId));
  return row?.homeLayout;
};

/** Turns inicio_personalizavel on for one person (it is off by default). */
const enableHomeLayout = (userId: string) =>
  m.db
    .insert(m.schema.featureFlagOverrides)
    .values({ userId, key: "inicio_personalizavel", enabled: true });

const CALENDAR_SECOND = [
  { id: "spending-calendar", visible: true },
  { id: "month-totals", visible: true },
  { id: "budget", visible: false },
  { id: "upcoming-bills", visible: true },
  { id: "accounts", visible: true },
  { id: "goals", visible: true },
  { id: "insight", visible: true },
] as const;

const resetHomeLayouts = async () => {
  await m.db.update(m.schema.userSettings).set({ homeLayout: null });
  await m.db.delete(m.schema.featureFlagOverrides);
  await m.db.delete(m.schema.featureFlags);
};

describe("home layout", () => {
  beforeEach(resetHomeLayouts);

  it("starts as the default, with or without a settings row", async () => {
    await m.db
      .delete(m.schema.userSettings)
      .where(m.eq(m.schema.userSettings.userId, "outro"));
    expect(await storedHomeLayout("owner")).toBeNull();
    for (const userId of ["owner", "outro"]) {
      const layout = await m.preferences.getHomeLayout(userId);
      expect(layout.customized).toBe(false);
      expect(layout.entries.filter((entry) => entry.visible)).toHaveLength(7);
    }
  });

  it("marks the calendar new in its first 30 days", async () => {
    const isNew = async (today: string) =>
      (await m.preferences.getHomeLayout("owner", { today })).entries.find(
        (entry) => entry.id === "spending-calendar",
      )?.isNew === true;
    expect(await isNew("2026-11-15")).toBe(true);
    expect(await isNew("2026-12-15")).toBe(false);
  });

  it("saves the blocks and reads them back; null restores", async () => {
    await m.preferences.setHomeLayout("owner", [...CALENDAR_SECOND]);
    const layout = await m.preferences.getHomeLayout("owner");
    expect(layout.customized).toBe(true);
    expect(layout.entries.map((entry) => entry.id).slice(0, 3)).toEqual([
      "balance",
      "spending-calendar",
      "month-totals",
    ]);
    const budget = layout.entries.find((entry) => entry.id === "budget");
    expect(budget?.visible).toBe(false);

    await m.preferences.setHomeLayout("owner", null);
    expect(await storedHomeLayout("owner")).toBeNull();
    expect((await m.preferences.getHomeLayout("owner")).customized).toBe(false);
  });

  it("creates the settings row when it is missing", async () => {
    await m.db
      .delete(m.schema.userSettings)
      .where(m.eq(m.schema.userSettings.userId, "outro"));
    await m.preferences.setHomeLayout("outro", [
      { id: "goals", visible: true },
    ]);
    expect(await storedHomeLayout("outro")).toEqual([
      { id: "goals", visible: true },
    ]);
  });

  it("ignores ids the catalog no longer knows", async () => {
    await m.preferences.setHomeLayout("owner", [
      { id: "bloco-aposentado", visible: true },
      { id: "goals", visible: true },
    ]);
    const { entries } = await m.preferences.getHomeLayout("owner");
    const ids: string[] = entries.map((entry) => entry.id);
    expect(ids.slice(0, 2)).toEqual(["balance", "goals"]);
    expect(ids).not.toContain("bloco-aposentado");
  });

  it("refuses anything but an array in the column", async () => {
    for (const value of [`'{"id":"budget"}'`, `'"budget"'`, `'null'`, `'1'`]) {
      await expect(
        m.db.execute(
          m.sql.raw(
            `update user_settings set home_layout = ${value}::jsonb where user_id = 'owner'`,
          ),
        ),
      ).rejects.toThrow();
    }
    expect(await storedHomeLayout("owner")).toBeNull();
  });
});

describe("saveHomeLayoutAction", () => {
  beforeEach(resetHomeLayouts);

  it("is refused on the server while the flag is off", async () => {
    const result = await m.saveHomeLayout({ blocks: [...CALENDAR_SECOND] });
    expect(result.serverError).toBe(
      "Personalizar o Início não está disponível na sua conta.",
    );
    expect(await storedHomeLayout("owner")).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("saves the session owner's blocks and refreshes the page", async () => {
    await enableHomeLayout("owner");
    const result = await m.saveHomeLayout({ blocks: [...CALENDAR_SECOND] });
    expect(result.serverError).toBeUndefined();
    expect(result.validationErrors).toBeUndefined();
    expect(await storedHomeLayout("owner")).toEqual(CALENDAR_SECOND);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("restores the default with null", async () => {
    await enableHomeLayout("owner");
    await m.preferences.setHomeLayout("owner", [...CALENDAR_SECOND]);
    const result = await m.saveHomeLayout({ blocks: null });
    expect(result.serverError).toBeUndefined();
    expect(await storedHomeLayout("owner")).toBeNull();
  });

  it("accepts a subset of the blocks", async () => {
    await enableHomeLayout("owner");
    const result = await m.saveHomeLayout({
      blocks: [{ id: "goals", visible: true }],
    });
    expect(result.validationErrors).toBeUndefined();
    const { entries } = await m.preferences.getHomeLayout("owner");
    const visible = entries.filter((entry) => entry.visible);
    expect(visible.map((entry) => entry.id)).toEqual(["balance", "goals"]);
  });

  it("refuses the Saldo, unknown, repeated and too many blocks", async () => {
    await enableHomeLayout("owner");
    const invalid = [
      [{ id: "balance", visible: false }],
      [{ id: "foo", visible: true }],
      [
        { id: "goals", visible: true },
        { id: "goals", visible: false },
      ],
      [...CALENDAR_SECOND, { id: "goals", visible: true }],
      [{ id: "goals", visible: "sim" }],
      [{ id: "goals", visible: true, userId: "outro" }],
    ];
    for (const blocks of invalid) {
      const result = await m.saveHomeLayout({ blocks } as never);
      expect(result.validationErrors, JSON.stringify(blocks)).toBeDefined();
    }
    expect(await storedHomeLayout("owner")).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("never takes the user from the client", async () => {
    await enableHomeLayout("owner");
    const result = await m.saveHomeLayout({
      blocks: [...CALENDAR_SECOND],
      userId: "outro",
    } as never);
    expect(result.validationErrors).toBeDefined();
    expect(await storedHomeLayout("owner")).toBeNull();
    expect(await storedHomeLayout("outro")).toBeNull();
  });

  it("keeps each account's Início to itself", async () => {
    await enableHomeLayout("owner");
    await enableHomeLayout("outro");
    await m.saveHomeLayout({ blocks: [...CALENDAR_SECOND] });
    mocks.requireUser.mockResolvedValue(OUTRO);
    await m.saveHomeLayout({ blocks: [{ id: "insight", visible: false }] });
    expect(await storedHomeLayout("owner")).toEqual(CALENDAR_SECOND);
    expect(await storedHomeLayout("outro")).toEqual([
      { id: "insight", visible: false },
    ]);
    const { entries } = await m.preferences.getHomeLayout("outro");
    expect(entries[1]).toEqual({ id: "insight", visible: false });
  });

  it("follows the global value, and a person's own over it", async () => {
    await m.db
      .insert(m.schema.featureFlags)
      .values({ key: "inicio_personalizavel", enabled: true });
    await m.db.insert(m.schema.featureFlagOverrides).values({
      userId: "outro",
      key: "inicio_personalizavel",
      enabled: false,
    });
    const owner = await m.saveHomeLayout({ blocks: [...CALENDAR_SECOND] });
    expect(owner.serverError).toBeUndefined();
    expect(await storedHomeLayout("owner")).toEqual(CALENDAR_SECOND);
    mocks.requireUser.mockResolvedValue(OUTRO);
    const outro = await m.saveHomeLayout({ blocks: [...CALENDAR_SECOND] });
    expect(outro.serverError).toBe(
      "Personalizar o Início não está disponível na sua conta.",
    );
    expect(await storedHomeLayout("outro")).toBeNull();
  });

  it("writes nothing without a session", async () => {
    await enableHomeLayout("owner");
    mocks.requireUser.mockRejectedValue(new Error("no session"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await m.saveHomeLayout({ blocks: [...CALENDAR_SECOND] });
    error.mockRestore();
    expect(result.serverError).toBeDefined();
    expect(await storedHomeLayout("owner")).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("keeps the saved blocks while the flag is off", async () => {
    await m.preferences.setHomeLayout("owner", [...CALENDAR_SECOND]);
    const result = await m.saveHomeLayout({ blocks: null });
    expect(result.serverError).toBeDefined();
    expect(await storedHomeLayout("owner")).toEqual(CALENDAR_SECOND);
  });

  it("follows the flag per person", async () => {
    await enableHomeLayout("outro");
    const owner = await m.saveHomeLayout({ blocks: null });
    expect(owner.serverError).toBeDefined();
    mocks.requireUser.mockResolvedValue(OUTRO);
    const outro = await m.saveHomeLayout({ blocks: [...CALENDAR_SECOND] });
    expect(outro.serverError).toBeUndefined();
    expect(await storedHomeLayout("outro")).toEqual(CALENDAR_SECOND);
    expect(await storedHomeLayout("owner")).toBeNull();
  });
});
