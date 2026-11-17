// The second factor of Administração (doc 01 §11.9) against the real Better
// Auth configuration and the real Data Access Layer on PGlite: a password
// session is not stamped, /admin pages send an unconfirmed administrator to
// the confirmation (404 for anyone else), admin actions refuse it, and an
// administrator who already has a passkey cannot add or remove passkeys
// before confirming with one. Nobody sets the stamp through the API.
import { count, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
// Outside a Next.js request there is no cookie store to write to.
vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "next-cookies" }),
}));
// The request the Data Access Layer reads: the cookie of whoever is calling.
const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: request.cookie }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

process.env.DATABASE_URL = "pglite:memory";
process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.OWNER_EMAIL = "ana@exemplo.com";

const PASSWORD = "uma senha bem longa";
const ORIGIN = "http://localhost:3000";
const NOT_ALLOWED = "Você não tem permissão para fazer isso.";

type Modules = {
  db: typeof import("./db/client")["db"];
  schema: typeof import("./db/schema");
  auth: typeof import("./auth")["auth"];
  dal: typeof import("./dal");
  actions: typeof import("./actions/admin");
};
let m: Modules;

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("./db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("./db/schema");
  const authModule = await import("./auth");
  const context = await authModule.auth.$context;
  for (const [id, role] of [
    ["ana", "admin"],
    ["bruno", "user"],
  ] as const) {
    await client.db.insert(schema.user).values({
      id,
      name: id,
      email: `${id}@exemplo.com`,
      role,
      emailVerified: true,
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
  m = {
    db: client.db,
    schema,
    auth: authModule.auth,
    dal: await import("./dal"),
    actions: await import("./actions/admin"),
  };
}, 120_000);

beforeEach(async () => {
  await m.db.delete(m.schema.passkey);
});

/** Signs in with the password over HTTP and returns the session cookie. */
async function signIn(id: "ana" | "bruno"): Promise<string> {
  const response = await m.auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email: `${id}@exemplo.com`, password: PASSWORD }),
    }),
  );
  expect(response.status).toBe(200);
  return (response.headers.get("set-cookie") ?? "")
    .split(",")
    .map((part) => part.split(";")[0]?.trim())
    .filter((part) => part?.includes("session_token"))
    .join("; ");
}

async function addPasskey(userId: string, id = `pk-${userId}`) {
  await m.db.insert(m.schema.passkey).values({
    id,
    name: "Meu aparelho",
    publicKey: "chave",
    userId,
    credentialID: `cred-${id}`,
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
    createdAt: new Date(),
  });
}

async function stampSessions(userId: string, at: Date | null) {
  await m.db
    .update(m.schema.session)
    .set({ passkeyVerifiedAt: at })
    .where(eq(m.schema.session.userId, userId));
}

let anaCookie = "";
let brunoCookie = "";

describe("password sessions", () => {
  it("are not stamped", async () => {
    anaCookie = await signIn("ana");
    brunoCookie = await signIn("bruno");
    request.cookie = anaCookie;
    const session = await m.dal.getSession();
    expect(session?.user.id).toBe("ana");
    expect(session?.session.passkeyVerifiedAt ?? null).toBeNull();
  });
});

describe("Data Access Layer", () => {
  it("sends an unconfirmed administrator to the confirmation", async () => {
    request.cookie = anaCookie;
    await stampSessions("ana", null);
    await expect(m.dal.requireAdmin("/admin/flags")).rejects.toThrow(
      "redirect:/ajustes/seguranca/admin?voltar=%2Fadmin%2Fflags",
    );
    expect(await m.dal.getAdmin()).toBeNull();
    expect((await m.dal.getAdminAccess())?.secondFactor).toBe("register");
    await addPasskey("ana");
    expect((await m.dal.getAdminAccess())?.secondFactor).toBe("confirm");
    expect(await m.dal.getAdmin()).toBeNull();
  });

  it("lets a session confirmed with a passkey in", async () => {
    request.cookie = anaCookie;
    await stampSessions("ana", new Date());
    expect((await m.dal.requireAdmin("/admin/flags")).id).toBe("ana");
    expect((await m.dal.getAdmin())?.id).toBe("ana");
    expect((await m.dal.getAdminAccess())?.secondFactor).toBe("ok");
    await stampSessions("ana", null);
  });

  it("gives anyone else the 404 page", async () => {
    request.cookie = brunoCookie;
    await stampSessions("bruno", new Date());
    await expect(m.dal.requireAdmin("/admin/usuarios")).rejects.toThrow(
      "notFound",
    );
    expect(await m.dal.getAdminAccess()).toBeNull();
    request.cookie = "";
    await expect(m.dal.requireAdmin("/admin/usuarios")).rejects.toThrow(
      "redirect:/entrar",
    );
  });
});

describe("admin actions", () => {
  const overrides = async () => {
    const [row] = await m.db
      .select({ total: count() })
      .from(m.schema.featureFlagOverrides);
    return row?.total ?? 0;
  };

  it("refuse an administrator who signed in with a password", async () => {
    request.cookie = anaCookie;
    await addPasskey("ana");
    const before = await overrides();
    const result = await m.actions.setGlobalFlagAction({
      key: "importar_extrato",
      value: false,
    });
    expect(result?.serverError).toBe(NOT_ALLOWED);
    expect(await overrides()).toBe(before);
    const [audit] = await m.db
      .select({ total: count() })
      .from(m.schema.auditLog);
    expect(audit?.total).toBe(0);
  });

  it("run for a session confirmed with a passkey", async () => {
    request.cookie = anaCookie;
    await stampSessions("ana", new Date());
    const result = await m.actions.setGlobalFlagAction({
      key: "importar_extrato",
      value: null,
    });
    expect(result?.serverError).toBeUndefined();
    await stampSessions("ana", null);
  });
});

describe("passkey management", () => {
  const attempts = (cookie: string, passkeyId: string) => {
    const headers = new Headers({ cookie });
    return {
      register: () =>
        m.auth.api.generatePasskeyRegistrationOptions({ headers }),
      remove: () =>
        m.auth.api.deletePasskey({ headers, body: { id: passkeyId } }),
    };
  };
  const blocked = {
    body: { code: "PASSKEY_CONFIRMATION_REQUIRED" },
  };

  it("is blocked for an unconfirmed administrator who has a passkey", async () => {
    await stampSessions("ana", null);
    await addPasskey("ana");
    const ana = attempts(anaCookie, "pk-ana");
    await expect(ana.register()).rejects.toMatchObject(blocked);
    await expect(ana.remove()).rejects.toMatchObject(blocked);
    const [row] = await m.db
      .select({ total: count() })
      .from(m.schema.passkey)
      .where(eq(m.schema.passkey.userId, "ana"));
    expect(row?.total).toBe(1);
  });

  it("allows the first passkey of an administrator", async () => {
    await stampSessions("ana", null);
    await expect(
      attempts(anaCookie, "pk-ana").register(),
    ).resolves.toBeTruthy();
  });

  it("is allowed once the session is confirmed", async () => {
    await stampSessions("ana", new Date());
    await addPasskey("ana");
    const ana = attempts(anaCookie, "pk-ana");
    await expect(ana.register()).resolves.toBeTruthy();
    await expect(ana.remove()).resolves.toBeTruthy();
    await stampSessions("ana", null);
  });

  it("is never blocked for someone who is not an administrator", async () => {
    await addPasskey("bruno");
    await stampSessions("bruno", null);
    const bruno = attempts(brunoCookie, "pk-bruno");
    await expect(bruno.register()).resolves.toBeTruthy();
    await expect(bruno.remove()).resolves.toBeTruthy();
  });
});

describe("session fields", () => {
  it("cannot be changed through the auth API", async () => {
    const response = await m.auth.handler(
      new Request(`${ORIGIN}/api/auth/update-session`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          cookie: anaCookie,
        },
        body: JSON.stringify({ passkeyVerifiedAt: new Date().toISOString() }),
      }),
    );
    expect(response.status).toBe(404);
    request.cookie = anaCookie;
    expect((await m.dal.getAdminAccess())?.secondFactor).not.toBe("ok");
  });
});
