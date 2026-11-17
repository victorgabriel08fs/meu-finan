// Acceptance of the terms and privacy policy (doc 01 §11.8) against an
// in-memory Postgres: it is written once and audited once, a screen from an
// older version is refused, and nobody else's account is touched.
import { count, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { LEGAL_OUTDATED, LEGAL_VERSION } from "@/lib/legal/version";

vi.mock("server-only", () => ({}));

process.env.DATABASE_URL = "pglite:memory";

type Modules = {
  db: typeof import("../db/client")["db"];
  schema: typeof import("../db/schema");
  legal: typeof import("./legal");
};
let m: Modules;

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("../db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("../db/schema");
  for (const id of ["ana", "bruno"]) {
    await client.db.insert(schema.user).values({
      id,
      name: id === "ana" ? "Ana Souza" : "Bruno Lima",
      email: `${id}@exemplo.com`,
      role: "user",
    });
  }
  m = { db: client.db, schema, legal: await import("./legal") };
}, 120_000);

async function audits(action: "legal.accepted") {
  const [row] = await m.db
    .select({ total: count() })
    .from(m.schema.auditLog)
    .where(eq(m.schema.auditLog.action, action));
  return row?.total ?? 0;
}

describe("accepting the terms", () => {
  it("starts with nothing accepted", async () => {
    expect(await m.legal.getLegalAcceptance("ana")).toEqual({
      version: null,
      acceptedAt: null,
    });
  });

  it("refuses a version other than the current one, changing nothing", async () => {
    await expect(m.legal.acceptLegal("ana", "2020-01-01")).rejects.toThrow(
      LEGAL_OUTDATED,
    );
    expect((await m.legal.getLegalAcceptance("ana")).version).toBeNull();
    expect(await audits("legal.accepted")).toBe(0);
  });

  it("records the version and the moment, audited, for that person only", async () => {
    const at = new Date("2026-11-20T12:00:00Z");
    await m.legal.acceptLegal("ana", LEGAL_VERSION, at);
    expect(await m.legal.getLegalAcceptance("ana")).toEqual({
      version: LEGAL_VERSION,
      acceptedAt: at,
    });
    expect(await m.legal.getLegalAcceptance("bruno")).toEqual({
      version: null,
      acceptedAt: null,
    });
    const [entry] = await m.db
      .select()
      .from(m.schema.auditLog)
      .where(eq(m.schema.auditLog.action, "legal.accepted"));
    expect(entry).toMatchObject({
      actorId: "ana",
      actorName: "Ana Souza",
      targetUserId: "ana",
      metadata: { legalVersion: LEGAL_VERSION },
    });
  });

  it("accepting again changes and audits nothing more", async () => {
    await m.legal.acceptLegal("ana", LEGAL_VERSION, new Date("2027-01-01"));
    expect(await audits("legal.accepted")).toBe(1);
    expect((await m.legal.getLegalAcceptance("ana")).acceptedAt).toEqual(
      new Date("2026-11-20T12:00:00Z"),
    );
  });

  it("asks again when the recorded version is older", async () => {
    await m.db
      .update(m.schema.user)
      .set({ legalVersion: "2020-01-01" })
      .where(eq(m.schema.user.id, "ana"));
    await m.legal.acceptLegal("ana", LEGAL_VERSION);
    expect((await m.legal.getLegalAcceptance("ana")).version).toBe(
      LEGAL_VERSION,
    );
    expect(await audits("legal.accepted")).toBe(2);
  });

  it("refuses an account that does not exist", async () => {
    await expect(
      m.legal.acceptLegal("ninguem", LEGAL_VERSION),
    ).rejects.toThrow();
  });
});
