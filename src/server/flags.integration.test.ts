// Feature flags against a real (in-memory) Postgres: resolution with global
// values and per-person values, and the importar_extrato flag refusing the
// import actions on the server.
import { count, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
// The signed-in person, normally from the session cookie.
const signedIn = vi.hoisted(() => ({ id: "bruno" }));
vi.mock("@/server/dal", () => ({
  requireUser: async () => ({
    id: signedIn.id,
    name: signedIn.id,
    email: `${signedIn.id}@exemplo.com`,
    role: "user",
  }),
  getAdmin: async () => null,
  getSession: async () => null,
}));
process.env.DATABASE_URL = "pglite:memory";

type Modules = {
  db: typeof import("./db/client")["db"];
  schema: typeof import("./db/schema");
  flags: typeof import("./flags");
  imports: typeof import("./actions/imports");
};
let m: Modules;
let accountId: string;

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("./db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("./db/schema");
  await client.db.insert(schema.user).values([
    { id: "ana", name: "Ana", email: "ana@exemplo.com", role: "admin" },
    { id: "bruno", name: "Bruno", email: "bruno@exemplo.com", role: "user" },
  ]);
  const { ensureOwnerDefaults } = await import("./db/seed-defaults");
  await ensureOwnerDefaults("bruno");
  const { createAccount } = await import("./domain/accounts");
  accountId = await createAccount("bruno", {
    name: "Conta principal",
    type: "checking",
    initialBalanceCents: 0,
  });
  m = {
    db: client.db,
    schema,
    flags: await import("./flags"),
    imports: await import("./actions/imports"),
  };
}, 120_000);

beforeEach(async () => {
  await m.db.delete(m.schema.featureFlags);
  await m.db.delete(m.schema.featureFlagOverrides);
});

const setGlobal = (key: string, enabled: boolean) =>
  m.db.insert(m.schema.featureFlags).values({ key, enabled });
const setOwn = (userId: string, key: string, enabled: boolean) =>
  m.db.insert(m.schema.featureFlagOverrides).values({ userId, key, enabled });

describe("getFlags", () => {
  it("uses the registry default when nothing is stored", async () => {
    expect((await m.flags.getFlags("ana")).importar_extrato).toBe(true);
    expect(await m.flags.isFlagEnabled("importar_extrato", "bruno")).toBe(true);
  });

  it("applies the global value to everyone", async () => {
    await setGlobal("importar_extrato", false);
    expect(await m.flags.isFlagEnabled("importar_extrato", "ana")).toBe(false);
    expect(await m.flags.isFlagEnabled("importar_extrato", "bruno")).toBe(
      false,
    );
  });

  it("lets one person's value win over the global one, for them only", async () => {
    await setGlobal("importar_extrato", false);
    await setOwn("bruno", "importar_extrato", true);
    expect(await m.flags.isFlagEnabled("importar_extrato", "bruno")).toBe(true);
    expect(await m.flags.isFlagEnabled("importar_extrato", "ana")).toBe(false);
  });

  it("ignores stored keys the registry no longer has", async () => {
    await setGlobal("flag_antiga", false);
    await setOwn("ana", "outra_antiga", true);
    const flags = await m.flags.getFlags("ana");
    expect(flags).toEqual({ importar_extrato: true });
  });

  it("drops a person's values with their account", async () => {
    await m.db.insert(m.schema.user).values({
      id: "carla",
      name: "Carla",
      email: "carla@exemplo.com",
    });
    await setOwn("carla", "importar_extrato", false);
    await m.db.delete(m.schema.user).where(eq(m.schema.user.id, "carla"));
    const [row] = await m.db
      .select({ total: count() })
      .from(m.schema.featureFlagOverrides);
    expect(row?.total).toBe(0);
  });
});

describe("importar_extrato off", () => {
  const OFF = "A importação de extratos está desativada no momento.";
  const confirmInput = () => ({
    accountId,
    format: "ofx" as const,
    fileRows: 1,
    duplicates: 0,
    rows: [
      {
        occurredOn: "2026-10-11",
        amountCents: -2_390,
        description: "Padaria",
        externalId: "ofx:FLAG-0001",
        categoryId: null,
      },
    ],
  });
  const importsCount = async () => {
    const [row] = await m.db.select({ total: count() }).from(m.schema.imports);
    return row?.total ?? 0;
  };

  it("refuses every import action on the server", async () => {
    await setGlobal("importar_extrato", false);
    const form = new FormData();
    form.set("accountId", accountId);
    form.set("file", new File(["x"], "extrato.ofx"));

    const analyzed = await m.imports.analyzeImportAction(form);
    const confirmed = await m.imports.confirmImportAction(confirmInput());
    const undone = await m.imports.undoImportAction({
      importId: "0192f3a4-5b6c-7d8e-9f01-23456789abcd",
    });
    expect(analyzed?.serverError).toBe(OFF);
    expect(confirmed?.serverError).toBe(OFF);
    expect(undone?.serverError).toBe(OFF);
    expect(await importsCount()).toBe(0);
  });

  it("follows the person's own value", async () => {
    await setGlobal("importar_extrato", false);
    await setOwn("bruno", "importar_extrato", true);
    const confirmed = await m.imports.confirmImportAction(confirmInput());
    expect(confirmed?.serverError).toBeUndefined();
    expect(confirmed?.data?.imported).toBe(1);
    expect(await importsCount()).toBe(1);
  });
});
