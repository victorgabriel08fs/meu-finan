// Sign-in with Google (ADR-15) against the real Better Auth configuration on
// PGlite, with Google's token endpoint stubbed (the provider only decodes the
// ID token it returns). Google never creates an account and never links by
// itself from a matching e-mail; only a signed-in person links, with the same
// verified e-mail; no token is kept; the flag gates sign-in (globally) and
// linking (per person); the callback's outcome reaches the access log.
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { LEGAL_VERSION } from "@/lib/legal/version";

vi.mock("server-only", () => ({}));
// Outside a Next.js request there is no cookie store to write to.
vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "next-cookies" }),
}));
const logged = vi.hoisted(() => ({
  events: [] as { event: string; data: Record<string, unknown> }[],
}));
vi.mock("@/server/observability/log", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/observability/log")>();
  return {
    ...original,
    logEvent: (event: string, data: Record<string, unknown>) => {
      logged.events.push({ event, data });
    },
  };
});

const ORIGIN = "http://localhost:3000";
const PASSWORD = "uma senha bem longa";
const OWNER_EMAIL = "dono@exemplo.com";

process.env.DATABASE_URL = "pglite:memory";
process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
process.env.BETTER_AUTH_URL = ORIGIN;
process.env.OWNER_EMAIL = OWNER_EMAIL;
process.env.PASSWORD_LEAK_CHECK = "off";
process.env.GOOGLE_CLIENT_ID = "123-abc.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "segredo-falso-do-google-para-testes";

type Profile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
};

const google = vi.hoisted(() => ({ profile: null as Profile | null }));

type Modules = {
  auth: typeof import("./auth")["auth"];
  db: typeof import("./db/client")["db"];
  schema: typeof import("./db/schema");
};
let m: Modules;

const base64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/** An unsigned ID token: the provider only decodes it. */
const idToken = (profile: Profile) =>
  `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url({
    iss: "https://accounts.google.com",
    aud: process.env.GOOGLE_CLIENT_ID,
    ...profile,
  })}.assinatura`;

const realFetch = globalThis.fetch;

beforeAll(async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      if (!google.profile) return new Response("{}", { status: 400 });
      return Response.json({
        access_token: "access-token-do-google",
        refresh_token: "refresh-token-do-google",
        id_token: idToken(google.profile),
        token_type: "Bearer",
        expires_in: 3600,
        scope: "openid email profile",
      });
    }
    return realFetch(input, init);
  });
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("./db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("./db/schema");
  const authModule = await import("./auth");
  const context = await authModule.auth.$context;
  for (const [id, banned] of [
    ["bruno", false],
    ["dani", false],
    ["carla", true],
  ] as const) {
    await client.db.insert(schema.user).values({
      id,
      name: id,
      email: `${id}@exemplo.com`,
      role: "user",
      banned,
      // Nobody here has a verified e-mail (no e-mail is ever sent).
      emailVerified: false,
      legalVersion: LEGAL_VERSION,
    });
    await client.db.insert(schema.account).values({
      id: `account-${id}`,
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await context.password.hash(PASSWORD),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  m = { auth: authModule.auth, db: client.db, schema };
}, 120_000);

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(async () => {
  logged.events = [];
  google.profile = null;
  await m.db.delete(m.schema.rateLimit);
  await setGlobalFlag(true);
  await m.db.delete(m.schema.featureFlagOverrides);
});

async function setGlobalFlag(enabled: boolean) {
  await m.db
    .insert(m.schema.featureFlags)
    .values({ key: "entrar_com_google", enabled })
    .onConflictDoUpdate({
      target: m.schema.featureFlags.key,
      set: { enabled },
    });
}

/** Cookie header from a jar plus the cookies a response set. */
function withCookies(jar: string, response: Response): string {
  const cookies = new Map(
    jar
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => [part.split("=")[0], part] as const),
  );
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";")[0]?.trim() ?? "";
    const name = pair.split("=")[0] ?? "";
    if (pair.endsWith("=")) cookies.delete(name);
    else cookies.set(name, pair);
  }
  return [...cookies.values()].join("; ");
}

async function post(path: string, body: unknown, cookie = "") {
  return m.auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    }),
  );
}

async function signInWithPassword(id: string): Promise<string> {
  const response = await post("/sign-in/email", {
    email: `${id}@exemplo.com`,
    password: PASSWORD,
  });
  expect(response.status).toBe(200);
  return withCookies("", response);
}

/**
 * Runs the redirect flow: the start endpoint, then Google's return to the
 * callback with `profile` as the account the person chose.
 */
async function googleFlow(
  start: Response,
  profile: Profile,
  jar = "",
): Promise<{ response: Response; location: string; cookie: string }> {
  expect(start.status).toBe(200);
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state");
  expect(state).toBeTruthy();
  google.profile = profile;
  const cookie = withCookies(jar, start);
  const response = await m.auth.handler(
    new Request(
      `${ORIGIN}/api/auth/callback/google?code=codigo&state=${state}`,
      { headers: { cookie } },
    ),
  );
  expect(response.status).toBe(302);
  return {
    response,
    location: response.headers.get("location") ?? "",
    cookie: withCookies(cookie, response),
  };
}

const signInStart = (body: Record<string, unknown> = {}) =>
  post("/sign-in/social", {
    provider: "google",
    callbackURL: "/inicio",
    errorCallbackURL: "/entrar",
    ...body,
  });

const linkStart = (cookie: string, body: Record<string, unknown> = {}) =>
  post(
    "/link-social",
    {
      provider: "google",
      callbackURL: "/ajustes/seguranca?vinculado=google",
      errorCallbackURL: "/ajustes/seguranca",
      ...body,
    },
    cookie,
  );

const profileOf = (id: string, overrides: Partial<Profile> = {}): Profile => ({
  sub: `google-${id}`,
  email: `${id}@exemplo.com`,
  email_verified: true,
  name: id,
  ...overrides,
});

const googleLinks = (userId?: string) =>
  m.db
    .select()
    .from(m.schema.account)
    .where(
      userId
        ? and(
            eq(m.schema.account.providerId, "google"),
            eq(m.schema.account.userId, userId),
          )
        : eq(m.schema.account.providerId, "google"),
    );

const errorOf = (location: string) =>
  new URL(location, ORIGIN).searchParams.get("error");

describe("sign-in with Google, never sign-up", () => {
  it("refuses an e-mail without an account and creates nothing", async () => {
    const before = await m.db.select().from(m.schema.user);
    const { location, response } = await googleFlow(
      await signInStart(),
      profileOf("ninguem"),
    );
    expect(new URL(location, ORIGIN).pathname).toBe("/entrar");
    expect(errorOf(location)).toBe("signup_disabled");
    expect(response.headers.getSetCookie().join()).not.toContain(
      "session_token=",
    );
    expect(await m.db.select().from(m.schema.user)).toHaveLength(before.length);
    expect(await googleLinks()).toHaveLength(0);
  });

  it("refuses the owner's e-mail on an account-less owner too", async () => {
    const { location } = await googleFlow(
      await signInStart(),
      profileOf("dono", { email: OWNER_EMAIL }),
    );
    expect(errorOf(location)).toBe("signup_disabled");
    const owner = await m.db
      .select()
      .from(m.schema.user)
      .where(eq(m.schema.user.email, OWNER_EMAIL));
    expect(owner).toHaveLength(0);
  });

  it("creates a user only from sign-up (the database hook)", async () => {
    const context = await m.auth.$context;
    await expect(
      context.internalAdapter.createUser(
        { email: OWNER_EMAIL, name: "Dono", emailVerified: true },
        { method: "oauth", oauth: { providerId: "google" } },
      ),
    ).rejects.toThrow(/Cadastro desativado/);
  });

  it("never links an existing account by itself from the e-mail", async () => {
    const { location } = await googleFlow(
      await signInStart(),
      profileOf("bruno"),
    );
    expect(errorOf(location)).toBe("account_not_linked");
    expect(await googleLinks()).toHaveLength(0);
  });

  it("logs the failure from the callback's redirect, with the provider from the path params", async () => {
    await googleFlow(await signInStart(), profileOf("ninguem"));
    expect(logged.events).toContainEqual(
      expect.objectContaining({
        event: "auth.sign_in_failed",
        data: expect.objectContaining({
          method: "google",
          code: "signup_disabled",
        }),
      }),
    );
    // No e-mail and no Google id in the log.
    expect(JSON.stringify(logged.events)).not.toContain("ninguem@");
    expect(JSON.stringify(logged.events)).not.toContain("google-ninguem");
  });

  it("refuses an ID token from the browser", async () => {
    const response = await signInStart({ idToken: { token: "x.y.z" } });
    expect(response.status).toBe(400);
  });
});

describe("linking, then signing in", () => {
  let brunoCookie = "";

  it("links with a session and the same verified e-mail, keeping no token", async () => {
    brunoCookie = await signInWithPassword("bruno");
    const { location } = await googleFlow(
      await linkStart(brunoCookie),
      profileOf("bruno", { email: "Bruno@Exemplo.com" }),
      brunoCookie,
    );
    expect(location).toContain("/ajustes/seguranca?vinculado=google");
    const [link] = await googleLinks("bruno");
    expect(link).toMatchObject({
      accountId: "google-bruno",
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    });
    expect(logged.events.map((entry) => entry.event)).toContain(
      "auth.social_linked",
    );
  });

  it("then signs in with Google, without a passkey stamp", async () => {
    const { location, cookie } = await googleFlow(
      await signInStart({ callbackURL: "/extrato" }),
      profileOf("bruno"),
    );
    expect(location).toContain("/extrato");
    expect(errorOf(location)).toBeNull();
    expect(cookie).toContain("session_token=");
    const sessions = await m.db
      .select()
      .from(m.schema.session)
      .where(eq(m.schema.session.userId, "bruno"));
    expect(sessions.length).toBeGreaterThan(1);
    expect(sessions.every((row) => row.passkeyVerifiedAt === null)).toBe(true);
    expect(logged.events).toContainEqual(
      expect.objectContaining({
        event: "auth.sign_in",
        data: expect.objectContaining({ method: "google", userId: "bruno" }),
      }),
    );
    // Signing in kept no token either.
    const [link] = await googleLinks("bruno");
    expect(link?.accessToken).toBeNull();
    expect(link?.idToken).toBeNull();
  });

  it("refuses a Google account with another e-mail", async () => {
    const cookie = await signInWithPassword("dani");
    const { location } = await googleFlow(
      await linkStart(cookie),
      profileOf("dani", { email: "outra@exemplo.com" }),
      cookie,
    );
    expect(errorOf(location)).toBe("email_does_not_match");
    expect(await googleLinks("dani")).toHaveLength(0);
  });

  it("refuses an e-mail Google has not verified", async () => {
    const cookie = await signInWithPassword("dani");
    const { location } = await googleFlow(
      await linkStart(cookie),
      profileOf("dani", { email_verified: false }),
      cookie,
    );
    expect(errorOf(location)).toBe("unable_to_link_account");
    expect(await googleLinks("dani")).toHaveLength(0);
  });

  it("refuses a Google account already linked to someone else", async () => {
    const cookie = await signInWithPassword("dani");
    const { location } = await googleFlow(
      await linkStart(cookie),
      profileOf("dani", { sub: "google-bruno" }),
      cookie,
    );
    expect(errorOf(location)).toBe("account_already_linked_to_different_user");
    expect(await googleLinks("dani")).toHaveLength(0);
  });

  it("refuses an ID token on link", async () => {
    const response = await linkStart(brunoCookie, {
      idToken: { token: "x.y.z" },
    });
    expect(response.status).toBe(400);
  });

  it("refuses a deactivated account even with a link", async () => {
    await m.db.insert(m.schema.account).values({
      id: "google-carla-link",
      accountId: "google-carla",
      providerId: "google",
      userId: "carla",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { location, response } = await googleFlow(
      await signInStart(),
      profileOf("carla"),
    );
    expect(errorOf(location)).toBe("BANNED_USER");
    expect(response.headers.getSetCookie().join()).not.toContain(
      "session_token=",
    );
  });

  it("keeps one row per Google account (unique index)", async () => {
    await expect(
      m.db.insert(m.schema.account).values({
        id: "duplicate",
        accountId: "google-bruno",
        providerId: "google",
        userId: "dani",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toThrow();
  });
});

describe("the flag", () => {
  it("off globally: sign-in is refused before reaching Google", async () => {
    await setGlobalFlag(false);
    const response = await signInStart();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "SOCIAL_SIGN_IN_OFF",
    });
  });

  it("off for the person: linking is refused", async () => {
    const cookie = await signInWithPassword("dani");
    await m.db.insert(m.schema.featureFlagOverrides).values({
      userId: "dani",
      key: "entrar_com_google",
      enabled: false,
    });
    const response = await linkStart(cookie);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "SOCIAL_SIGN_IN_OFF",
    });
  });

  it("on only for the person: linking works with the global value off", async () => {
    await setGlobalFlag(false);
    const cookie = await signInWithPassword("dani");
    await m.db.insert(m.schema.featureFlagOverrides).values({
      userId: "dani",
      key: "entrar_com_google",
      enabled: true,
    });
    const { location } = await googleFlow(
      await linkStart(cookie),
      profileOf("dani"),
      cookie,
    );
    expect(errorOf(location)).toBeNull();
    expect(await googleLinks("dani")).toHaveLength(1);
  });
});

describe("unlinking", () => {
  it("never removes the password", async () => {
    const cookie = await signInWithPassword("dani");
    const response = await post(
      "/unlink-account",
      { accountId: "account-dani" },
      cookie,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "CREDENTIAL_REQUIRED",
    });
  });

  it("refuses a session older than a day, on link and unlink", async () => {
    const cookie = await signInWithPassword("dani");
    await m.db
      .update(m.schema.session)
      .set({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
      .where(eq(m.schema.session.userId, "dani"));
    for (const response of [
      await linkStart(cookie),
      await post("/unlink-account", { accountId: "google-link" }, cookie),
    ]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        code: "SESSION_NOT_FRESH",
      });
    }
  });

  it("removes the Google link, even with the flag off", async () => {
    await setGlobalFlag(false);
    const cookie = await signInWithPassword("dani");
    const [link] = await googleLinks("dani");
    const response = await post(
      "/unlink-account",
      { accountId: link?.id },
      cookie,
    );
    expect(response.status).toBe(200);
    expect(await googleLinks("dani")).toHaveLength(0);
    expect(logged.events).toContainEqual(
      expect.objectContaining({
        event: "auth.social_unlinked",
        data: expect.objectContaining({ method: "google", userId: "dani" }),
      }),
    );
  });
});

describe("endpoints that are off", () => {
  it.each([
    ["GET", "/get-access-token"],
    ["POST", "/get-access-token"],
    ["POST", "/refresh-token"],
    ["GET", "/account-info"],
    ["GET", "/error"],
  ])("%s %s answers 404", async (method, path) => {
    const cookie = await signInWithPassword("bruno");
    const response = await m.auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method,
        headers: {
          origin: ORIGIN,
          cookie,
          ...(method === "POST" ? { "content-type": "application/json" } : {}),
        },
        ...(method === "POST"
          ? { body: JSON.stringify({ providerId: "google" }) }
          : {}),
      }),
    );
    expect(response.status).toBe(404);
  });
});

describe("deleting the account", () => {
  it("deletes its Google link (cascade)", async () => {
    expect(await googleLinks("bruno")).toHaveLength(1);
    await m.db.delete(m.schema.user).where(eq(m.schema.user.id, "bruno"));
    expect(await googleLinks("bruno")).toHaveLength(0);
  });
});
