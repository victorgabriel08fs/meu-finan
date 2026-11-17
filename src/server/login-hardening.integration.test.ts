// Login hardening (S5) against the real Better Auth configuration and an
// in-memory Postgres (PGlite): the per-e-mail attempt limit and the refusal of
// leaked passwords. The leak service is never reached: fetch is stubbed.
import { createHash } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "next-cookies" }),
}));

const ORIGIN = "http://localhost:3000";
const OWNER_EMAIL = "dono@exemplo.com";
const SETUP_TOKEN = "setup-token-for-tests-0123456789abcdef";
const PASSWORD = "uma senha bem longa";
const LEAKED = "senha vazada de teste";

process.env.DATABASE_URL = "pglite:memory";
process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
process.env.BETTER_AUTH_URL = ORIGIN;
process.env.OWNER_EMAIL = OWNER_EMAIL;
process.env.SETUP_TOKEN = SETUP_TOKEN;

type Modules = {
  auth: typeof import("./auth")["auth"];
  header: string;
  db: typeof import("./db/client")["db"];
  schema: typeof import("./db/schema");
  clearLoginAttempts: typeof import("./security/login-attempts")["clearLoginAttempts"];
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
    clearLoginAttempts: (await import("./security/login-attempts"))
      .clearLoginAttempts,
  };
}, 120_000);

afterEach(() => {
  process.env.PASSWORD_LEAK_CHECK = "off";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let ipCounter = 0;
const nextIp = () =>
  `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

/** Each request comes from a new address: a distributed attack, so only the
 * per-e-mail limit can stop it. */
async function attempt(email: string, password: string) {
  const response = await m.auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-forwarded-for": nextIp(),
      },
      body: JSON.stringify({ email, password }),
    }),
  );
  const body = (await response.json().catch(() => null)) as {
    code?: string;
    message?: string;
    retryAfter?: number;
  } | null;
  return { status: response.status, body, response };
}

const attemptsKey = (email: string) =>
  `meu-finan:login-email:${createHash("sha256").update(email).digest("hex")}`;

function stubHibp(...suffixes: string[]) {
  process.env.PASSWORD_LEAK_CHECK = "on";
  const fetcher = vi.fn(
    async (..._args: Parameters<typeof fetch>) =>
      new Response(
        suffixes.map((s) => `${s}:42`).join("\r\n") ||
          "0000000000000000000000000000000000A:0",
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function sha1Suffix(value: string) {
  return createHash("sha1").update(value).digest("hex").toUpperCase().slice(5);
}

async function setupOwner() {
  const result = await m.auth.api.signUpEmail({
    body: { name: "Dono", email: OWNER_EMAIL, password: PASSWORD },
    headers: new Headers({ [m.header]: SETUP_TOKEN }),
  });
  return result;
}

describe("leaked passwords", () => {
  it("refuses a leaked password at sign-up and creates nobody", async () => {
    const fetcher = stubHibp(sha1Suffix(LEAKED));
    await expect(
      m.auth.api.signUpEmail({
        body: { name: "Dono", email: OWNER_EMAIL, password: LEAKED },
        headers: new Headers({ [m.header]: SETUP_TOKEN }),
      }),
    ).rejects.toMatchObject({ body: { code: "PASSWORD_COMPROMISED" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const users = await m.db.select().from(m.schema.user);
    expect(users).toHaveLength(0);
  });

  it("answers 'Cadastro desativado' without the token and never calls the service", async () => {
    const fetcher = stubHibp(sha1Suffix(LEAKED));
    await expect(
      m.auth.api.signUpEmail({
        body: { name: "Dono", email: OWNER_EMAIL, password: LEAKED },
        headers: new Headers(),
      }),
    ).rejects.toThrow(/Cadastro desativado/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails open at sign-up when the service is down", async () => {
    process.env.PASSWORD_LEAK_CHECK = "on";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const result = await setupOwner();
    expect(result.user.email).toBe(OWNER_EMAIL);
  });

  it("refuses a leaked new password on change-password and keeps the old one", async () => {
    const signedIn = await m.auth.api.signInEmail({
      body: { email: OWNER_EMAIL, password: PASSWORD },
      returnHeaders: true,
    });
    const cookie = (signedIn.headers.getSetCookie() ?? [])
      .map((c) => c.split(";")[0])
      .join("; ");
    const headers = new Headers({ cookie, origin: ORIGIN });

    stubHibp(sha1Suffix(LEAKED));
    await expect(
      m.auth.api.changePassword({
        body: { currentPassword: PASSWORD, newPassword: LEAKED },
        headers,
      }),
    ).rejects.toMatchObject({ body: { code: "PASSWORD_COMPROMISED" } });
    expect((await attempt(OWNER_EMAIL, PASSWORD)).status).toBe(200);

    // Service down: fails open.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const clean = "outra senha bem longa";
    await m.auth.api.changePassword({
      body: { currentPassword: PASSWORD, newPassword: clean },
      headers,
    });
    expect((await attempt(OWNER_EMAIL, clean)).status).toBe(200);
    await m.auth.api.changePassword({
      body: { currentPassword: clean, newPassword: PASSWORD },
      headers,
    });
  });

  it("never calls the service when signing in", async () => {
    const fetcher = stubHibp(sha1Suffix(PASSWORD));
    expect((await attempt(OWNER_EMAIL, PASSWORD)).status).toBe(200);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("per-e-mail login limit", () => {
  const GHOST = "ninguem@exemplo.com";

  async function sequence(email: string, count: number, password: string) {
    const out: { status: number; code?: string; message?: string }[] = [];
    for (let i = 0; i < count; i++) {
      const r = await attempt(email, password);
      out.push({
        status: r.status,
        code: r.body?.code,
        message: r.body?.message,
      });
    }
    return out;
  }

  it("locks after 10 attempts: the same for an existing and a missing account", async () => {
    const real = await sequence(OWNER_EMAIL, 11, "senha errada qualquer");
    const ghost = await sequence(GHOST, 11, "senha errada qualquer");
    expect(real).toEqual(ghost);
    expect(real.slice(0, 10).every((r) => r.status === 401)).toBe(true);
    expect(real[10]?.status).toBe(429);
    expect(real[10]?.code).toBe("LOGIN_LOCKED");
    expect(real[10]?.message).toMatch(/Muitas tentativas com este e-mail/);
  });

  it("answers the lock with retryAfter and X-Retry-After, and refuses the right password too", async () => {
    const locked = await attempt(OWNER_EMAIL, PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.body?.code).toBe("LOGIN_LOCKED");
    expect(locked.body?.retryAfter).toBeGreaterThan(0);
    expect(locked.response.headers.get("x-retry-after")).toBe(
      String(locked.body?.retryAfter),
    );
  });

  it("does not block passkey sign-in while locked", async () => {
    const response = await m.auth.handler(
      new Request(`${ORIGIN}/api/auth/passkey/generate-authenticate-options`, {
        headers: { origin: ORIGIN, "x-forwarded-for": nextIp() },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("keeps no e-mail in plain text in rate_limit", async () => {
    const rows = await m.db
      .select()
      .from(m.schema.rateLimit)
      .where(like(m.schema.rateLimit.key, "%@%"));
    expect(rows).toHaveLength(0);
  });

  it("clearLoginAttempts lifts the lock", async () => {
    await m.clearLoginAttempts(OWNER_EMAIL);
    expect((await attempt(OWNER_EMAIL, PASSWORD)).status).toBe(200);
  });

  it("counts the e-mail normalized, and leaves other e-mails alone", async () => {
    const email = "normaliza@exemplo.com";
    await sequence(email, 5, "x");
    await sequence(`  ${email.toUpperCase()}  `, 5, "x");
    expect((await attempt(email, "x")).status).toBe(429);
    expect((await attempt("outro@exemplo.com", "x")).status).toBe(401);
  });

  it("resets the counter on success", async () => {
    await m.clearLoginAttempts(OWNER_EMAIL);
    const first = await sequence(OWNER_EMAIL, 9, "errada errada errada");
    expect(first.every((r) => r.status === 401)).toBe(true);
    expect((await attempt(OWNER_EMAIL, PASSWORD)).status).toBe(200);
    const second = await sequence(OWNER_EMAIL, 10, "errada errada errada");
    expect(second.every((r) => r.status === 401)).toBe(true);
    expect((await attempt(OWNER_EMAIL, "errada errada errada")).status).toBe(
      429,
    );
  });

  it("frees the e-mail after the window", async () => {
    expect((await attempt(OWNER_EMAIL, PASSWORD)).status).toBe(429);
    await m.db
      .update(m.schema.rateLimit)
      .set({ lastRequest: Date.now() - 16 * 60 * 1000 })
      .where(eq(m.schema.rateLimit.key, attemptsKey(OWNER_EMAIL)));
    expect((await attempt(OWNER_EMAIL, PASSWORD)).status).toBe(200);
  });
});
