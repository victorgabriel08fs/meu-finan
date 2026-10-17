// Tips and novidades per user against a real (in-memory) Postgres: the
// snapshot the browser starts from, marking seen, turning tips off and
// "Rever dicas" (doc 02 §6.16).
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

let tips: typeof import("./tips");
let accounts: typeof import("./accounts");
let db: typeof import("../db/client").db;
let schema: typeof import("../db/schema");

const ZONE = "America/Sao_Paulo";

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  ({ db } = await import("../db/client"));
  await migrate(db as never, { migrationsFolder: "drizzle" });
  schema = await import("../db/schema");
  // 15/out/2026 02:00 UTC is still the 14th in São Paulo.
  await db.insert(schema.user).values([
    {
      id: "owner",
      name: "Ana",
      email: "ana@exemplo.com",
      createdAt: new Date("2026-10-15T02:00:00Z"),
    },
    { id: "other", name: "Bia", email: "bia@exemplo.com" },
  ]);
  tips = await import("./tips");
  accounts = await import("./accounts");
}, 120_000);

const snapshot = (userId = "owner") =>
  tips.getTipsSnapshot(userId, { timeZone: ZONE });

describe("tips per user", () => {
  it("starts with nothing seen, tips on and the account's creation day", async () => {
    expect(await snapshot()).toEqual({
      seen: [],
      off: false,
      createdOn: "2026-10-14",
      context: { hasAccounts: false, hasPasskey: false, role: null, flags: [] },
    });
  });

  it("marks registry tips seen once, ignoring anything else", async () => {
    await tips.markTipsSeen("owner", [
      "inicio-lancamento-rapido",
      "inicio-lancamento-rapido",
      "nao-existe",
      tips.TIPS_OFF_ROW,
    ]);
    await tips.markTipsSeen("owner", ["inicio-lancamento-rapido"]);
    await tips.markTipsSeen("owner", []);
    const state = await snapshot();
    expect(state.seen).toEqual(["inicio-lancamento-rapido"]);
    expect(state.off).toBe(false);
    // Nothing leaked to the other user.
    expect((await snapshot("other")).seen).toEqual([]);
  });

  it("turns every tip off and back on without touching what was seen", async () => {
    await tips.setTipsOff("owner", true);
    await tips.setTipsOff("owner", true);
    let state = await snapshot();
    expect(state.off).toBe(true);
    expect(state.seen).toEqual(["inicio-lancamento-rapido"]);
    expect(await tips.getTipsOff("owner")).toBe(true);
    expect((await snapshot("other")).off).toBe(false);
    expect(await tips.getTipsOff("other")).toBe(false);

    await tips.setTipsOff("owner", false);
    state = await snapshot();
    expect(state.off).toBe(false);
    expect(state.seen).toEqual(["inicio-lancamento-rapido"]);
    expect(await tips.getTipsOff("owner")).toBe(false);
  });

  it("“Rever dicas” brings the basics back and keeps novidades read", async () => {
    await tips.markTipsSeen("owner", [
      "extrato-busca",
      "novidade-relatorios",
      "novidade-atalhos-do-app",
    ]);
    await tips.markTipsSeen("other", ["extrato-busca"]);
    await tips.setTipsOff("owner", true);

    await tips.resetTips("owner");
    const state = await snapshot();
    expect(state.off).toBe(false);
    expect([...state.seen].sort()).toEqual([
      "novidade-atalhos-do-app",
      "novidade-relatorios",
    ]);
    expect((await snapshot("other")).seen).toEqual(["extrato-busca"]);
  });

  it("reads the context from accounts and passkeys", async () => {
    const id = await accounts.createAccount("owner", {
      name: "Conta principal",
      type: "checking",
      initialBalanceCents: 0,
    });
    await db.insert(schema.passkey).values({
      id: "pk-1",
      publicKey: "chave",
      userId: "owner",
      credentialID: "credencial",
      counter: 0,
      deviceType: "multiDevice",
      backedUp: true,
    });
    expect((await snapshot()).context).toEqual({
      hasAccounts: true,
      hasPasskey: true,
      role: null,
      flags: [],
    });
    expect((await snapshot("other")).context.hasAccounts).toBe(false);

    // An archived account does not count: the Início is the checklist again.
    await accounts.archiveAccount("owner", id);
    expect((await snapshot()).context.hasAccounts).toBe(false);
  });

  it("has no creation day for an unknown user", async () => {
    const state = await snapshot("ninguem");
    expect(state.createdOn).toBeNull();
    expect(state.seen).toEqual([]);
  });
});
