// Runs the real Better Auth configuration against an in-memory Postgres
// (PGlite) to prove the sign-up rules: no sign-up without the setup token, only
// the owner's e-mail for the first account (the administrator), never a second
// sign-up; accounts made by an administrator sign in unless deactivated; the
// admin plugin's own endpoints stay off.
import { count, eq } from "drizzle-orm";
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

  it("creates the owner with the token and the owner's e-mail, as administrator", async () => {
    const result = await signUp("Dono@Exemplo.com", SETUP_TOKEN);
    expect(result.user.email).toBe(OWNER_EMAIL);
    expect(await userCount()).toBe(1);
    const [row] = await m.db
      .select({ role: m.schema.user.role, banned: m.schema.user.banned })
      .from(m.schema.user)
      .where(eq(m.schema.user.id, result.user.id));
    expect(row).toEqual({ role: "admin", banned: false });
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

describe("accounts made by an administrator", () => {
  // The panel creates them outside Better Auth (src/server/domain/users.ts);
  // here they are inserted the same way, with a password already set.
  const addAccount = async (email: string, banned: boolean) => {
    const id = `user-${email}`;
    await m.db
      .insert(m.schema.user)
      .values({ id, name: email, email, role: "user", banned });
    const context = await m.auth.$context;
    await m.db.insert(m.schema.account).values({
      id: `account-${email}`,
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await context.password.hash(PASSWORD),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  };

  it("sign in like any account", async () => {
    await addAccount("bruno@exemplo.com", false);
    const ok = await m.auth.api.signInEmail({
      body: { email: "bruno@exemplo.com", password: PASSWORD },
    });
    expect(ok.token).toBeTruthy();
  });

  it("cannot sign in while deactivated", async () => {
    await addAccount("carla@exemplo.com", true);
    await expect(
      m.auth.api.signInEmail({
        body: { email: "carla@exemplo.com", password: PASSWORD },
      }),
    ).rejects.toMatchObject({ body: { code: "BANNED_USER" } });
  });

  it("cannot make themselves administrators or lift a ban through the auth API", async () => {
    const signIn = await m.auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "bruno@exemplo.com",
          password: PASSWORD,
        }),
      }),
    );
    expect(signIn.status).toBe(200);
    const cookie = (signIn.headers.get("set-cookie") ?? "")
      .split(",")
      .map((part) => part.split(";")[0]?.trim())
      .filter((part) => part?.includes("session_token"))
      .join("; ");
    expect(cookie).toContain("session_token");
    const updateUser = (data: Record<string, unknown>) =>
      m.auth.handler(
        new Request("http://localhost:3000/api/auth/update-user", {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify(data),
        }),
      );

    // The session works: the person may change their own name...
    expect((await updateUser({ name: "Bruno L." })).status).toBe(200);
    // ...but not the fields the admin plugin owns.
    for (const data of [{ role: "admin" }, { banned: false }]) {
      expect((await updateUser(data)).status, JSON.stringify(data)).toBe(400);
    }
    const [row] = await m.db
      .select({ role: m.schema.user.role })
      .from(m.schema.user)
      .where(eq(m.schema.user.email, "bruno@exemplo.com"));
    expect(row?.role).toBe("user");
  });
});

describe("admin plugin endpoints", () => {
  it("are not reachable over HTTP", async () => {
    for (const path of [
      "/admin/list-users",
      "/admin/impersonate-user",
      "/admin/set-role",
      "/admin/ban-user",
      "/admin/remove-user",
      "/admin/create-user",
    ]) {
      const response = await m.auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: path === "/admin/list-users" ? "GET" : "POST",
          headers: {
            origin: "http://localhost:3000",
            "content-type": "application/json",
          },
          body: path === "/admin/list-users" ? undefined : "{}",
        }),
      );
      expect(response.status, path).toBe(404);
    }
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
