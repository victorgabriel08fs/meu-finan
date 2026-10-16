// Runs the real Better Auth configuration against an in-memory Postgres
// (PGlite) to prove the single-owner rules: no sign-up without the setup token,
// only the owner's e-mail, never a second user.
import { count } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Outside a Next.js request there is no cookie store to write to.
vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "next-cookies" }),
}));

const OWNER_EMAIL = "dono@exemplo.com";
const SETUP_TOKEN = "setup-token-for-tests-0123456789abcdef";
const PASSWORD = "uma senha bem longa";

process.env.DATABASE_URL = "pglite:memory";
process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.OWNER_EMAIL = OWNER_EMAIL;
process.env.SETUP_TOKEN = SETUP_TOKEN;

type Modules = {
  auth: typeof import("./auth")["auth"];
  header: string;
  db: typeof import("./db/client")["db"];
  schema: typeof import("./db/schema");
  throttle: typeof import("./security/throttle")["throttle"];
};
let m: Modules;

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("./db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const authModule = await import("./auth");
  m = {
    auth: authModule.auth,
    header: authModule.SETUP_TOKEN_HEADER,
    db: client.db,
    schema: await import("./db/schema"),
    throttle: (await import("./security/throttle")).throttle,
  };
}, 120_000);

const signUp = (email: string, token?: string) =>
  m.auth.api.signUpEmail({
    body: { name: "Dono", email, password: PASSWORD },
    headers: new Headers(token ? { [m.header]: token } : {}),
  });

const userCount = async () => {
  const [row] = await m.db.select({ total: count() }).from(m.schema.user);
  return row?.total ?? 0;
};

describe("single-owner sign-up", () => {
  it("refuses sign-up without the setup token", async () => {
    await expect(signUp(OWNER_EMAIL)).rejects.toThrow(/Cadastro desativado/);
    await expect(
      signUp(OWNER_EMAIL, "wrong-token-0123456789abcdef0123"),
    ).rejects.toThrow(/Cadastro desativado/);
    expect(await userCount()).toBe(0);
  });

  it("refuses an e-mail other than the owner's, even with the token", async () => {
    await expect(signUp("outra@exemplo.com", SETUP_TOKEN)).rejects.toThrow();
    expect(await userCount()).toBe(0);
  });

  it("creates the owner with the token and the owner's e-mail", async () => {
    const result = await signUp("Dono@Exemplo.com", SETUP_TOKEN);
    expect(result.user.email).toBe(OWNER_EMAIL);
    expect(await userCount()).toBe(1);
  });

  it("never creates a second user", async () => {
    await expect(signUp(OWNER_EMAIL, SETUP_TOKEN)).rejects.toThrow();
    await expect(signUp("outra@exemplo.com", SETUP_TOKEN)).rejects.toThrow();
    expect(await userCount()).toBe(1);
  });

  it("signs in only with the right password", async () => {
    const ok = await m.auth.api.signInEmail({
      body: { email: OWNER_EMAIL, password: PASSWORD },
    });
    expect(ok.token).toBeTruthy();
    await expect(
      m.auth.api.signInEmail({
        body: { email: OWNER_EMAIL, password: "outra senha qualquer" },
      }),
    ).rejects.toThrow();
  });
});

describe("throttle", () => {
  it("blocks after the limit and resets after the window", async () => {
    const rule = { windowSeconds: 60, max: 2 };
    const now = 1_700_000_000_000;
    expect((await m.throttle("test:a", rule, { now })).ok).toBe(true);
    expect((await m.throttle("test:a", rule, { now: now + 1_000 })).ok).toBe(
      true,
    );
    const blocked = await m.throttle("test:a", rule, { now: now + 2_000 });
    expect(blocked).toEqual({ ok: false, retryAfterSeconds: 58 });
    expect((await m.throttle("test:b", rule, { now: now + 2_000 })).ok).toBe(
      true,
    );
    expect((await m.throttle("test:a", rule, { now: now + 61_000 })).ok).toBe(
      true,
    );
  });
});
