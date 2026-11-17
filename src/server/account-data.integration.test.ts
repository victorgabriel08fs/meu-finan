// Ajustes › Dados against a real (in-memory) Postgres: exporting all of one's
// data (only one's own rows, no secrets, the same CSV as the ledger export)
// and deleting one's own account (e-mail confirmation, owner and last
// administrator refused, audit entry), plus the recent sign-in the action
// and the route ask for.

import { and, count, eq, type SQL, sql } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "next-cookies" }),
}));
const jar = vi.hoisted(() => ({ deleted: [] as string[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    delete: (cookie: string | { name: string }) => {
      jar.deleted.push(typeof cookie === "string" ? cookie : cookie.name);
    },
  }),
  headers: async () => new Headers(),
}));
// Who is signed in, and how long ago; normally read from the session cookie.
const signedIn = vi.hoisted(() => ({
  current: null as null | {
    id: string;
    name: string;
    email: string;
    role: "admin" | "user";
  },
  recent: true,
}));
vi.mock("@/server/dal", () => ({
  requireUser: async () => {
    if (!signedIn.current) throw new Error("sem sessão");
    return signedIn.current;
  },
  getAdmin: async () => null,
  getSession: async () => null,
  getRecentSignIn: async () =>
    signedIn.current
      ? { user: signedIn.current, recent: signedIn.recent }
      : null,
}));

process.env.DATABASE_URL = "pglite:memory";
process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.OWNER_EMAIL = "ana@exemplo.com";

type Modules = {
  db: typeof import("./db/client")["db"];
  schema: typeof import("./db/schema");
  users: typeof import("./domain/users");
  exporter: typeof import("./domain/data-export");
  context: typeof import("./domain/context");
  actions: typeof import("./actions/account");
  route: typeof import("../app/api/export/data/route");
};
let m: Modules;

const person = (id: string, role: "admin" | "user" = "user") => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  email: `${id}@exemplo.com`,
  role,
});
const ANA = person("ana", "admin");
const BIA = person("bia", "admin");
const BRUNO = person("bruno");
const CARLA = person("carla");

const SECRETS = {
  token: "token-secreto-da-sessao-do-bruno",
  password: "hash-secreto-da-senha-do-bruno",
  publicKey: "chave-publica-secreta-do-bruno",
  endpoint: "https://push.exemplo.com/endpoint-secreto-do-bruno",
};
const GROUP = "0190a000-0000-7000-8000-0000000000a1";
const EXPENSE_SHARED = "0190a000-0000-7000-8000-0000000000b1";
const EXPENSE_OTHERS = "0190a000-0000-7000-8000-0000000000b2";

let anaTxnId = "";
let brunoTagId = "";

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("./db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("./db/schema");
  const { ensureOwnerDefaults } = await import("./db/seed-defaults");
  // Ana first: without OWNER_EMAIL she would be the first access too.
  for (const row of [ANA, BIA, BRUNO, CARLA]) {
    await client.db.insert(schema.user).values({ ...row, emailVerified: true });
    await ensureOwnerDefaults(row.id);
  }
  m = {
    db: client.db,
    schema,
    users: await import("./domain/users"),
    exporter: await import("./domain/data-export"),
    context: await import("./domain/context"),
    actions: await import("./actions/account"),
    route: await import("../app/api/export/data/route"),
  };

  const accounts = await import("./domain/accounts");
  const transactions = await import("./domain/transactions");
  const s = schema;
  for (const who of [ANA, BRUNO]) {
    const ctx = await m.context.getUserContext(who.id, { now: Date.now() });
    const accountId = await accounts.createAccount(who.id, {
      name: `Conta de ${who.name}`,
      type: "checking",
      initialBalanceCents: 123_45,
    });
    await transactions.createTransaction(ctx, {
      kind: "expense",
      amountCents: 64_50,
      accountId,
      categoryId: null,
      description: who === ANA ? "Segredo da Ana" : "Mercado do Bruno",
      occurredOn: ctx.todayIso,
    });
  }
  const [anaTxn] = await m.db
    .select({ id: s.transactions.id })
    .from(s.transactions)
    .where(eq(s.transactions.userId, ANA.id));
  anaTxnId = anaTxn?.id ?? "";
  const [brunoTxn] = await m.db
    .select({ id: s.transactions.id })
    .from(s.transactions)
    .where(eq(s.transactions.userId, BRUNO.id));
  const [tag] = await m.db
    .insert(s.tags)
    .values({ userId: BRUNO.id, name: "feira" })
    .returning({ id: s.tags.id });
  brunoTagId = tag?.id ?? "";
  await m.db
    .insert(s.transactionTags)
    .values({ transactionId: brunoTxn?.id ?? "", tagId: brunoTagId });

  // Bruno's secrets, which must never reach the archive.
  const now = new Date();
  await m.db.insert(s.session).values({
    id: "session-bruno",
    token: SECRETS.token,
    userId: BRUNO.id,
    expiresAt: new Date(now.getTime() + 86_400_000),
    createdAt: now,
    updatedAt: now,
    userAgent: "Firefox",
  });
  await m.db.insert(s.account).values({
    id: "account-bruno",
    accountId: BRUNO.id,
    providerId: "credential",
    userId: BRUNO.id,
    password: SECRETS.password,
    createdAt: now,
    updatedAt: now,
  });
  await m.db.insert(s.passkey).values({
    id: "passkey-bruno",
    name: "iPhone",
    publicKey: SECRETS.publicKey,
    userId: BRUNO.id,
    credentialID: "credencial-bruno",
    counter: 0,
    deviceType: "multiDevice",
    backedUp: true,
  });
  await m.db.insert(s.pushSubscriptions).values({
    userId: BRUNO.id,
    endpoint: SECRETS.endpoint,
    p256dh: "p256dh-secreto",
    auth: "auth-secreto",
  });

  // A group with Ana, Bruno and Carla: Bruno has a part in one expense only.
  await m.db
    .insert(s.shareGroups)
    .values({ id: GROUP, name: "Casa", createdBy: ANA.id });
  const members = await m.db
    .insert(s.shareMembers)
    .values(
      [ANA, BRUNO, CARLA].map((who) => ({
        groupId: GROUP,
        userId: who.id,
        invitedEmail: who.email,
        displayName: who.name,
        role: who === ANA ? ("owner" as const) : ("member" as const),
        status: "active" as const,
      })),
    )
    .returning({ id: s.shareMembers.id, userId: s.shareMembers.userId });
  // An open invite to an e-mail without an account: its name is the e-mail.
  await m.db.insert(s.shareMembers).values({
    groupId: GROUP,
    userId: null,
    invitedEmail: "dora@exemplo.com",
    displayName: "dora@exemplo.com",
    status: "invited",
    invitedBy: ANA.id,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const memberOf = (id: string) =>
    members.find((row) => row.userId === id)?.id ?? "";
  for (const [id, description, takers] of [
    [EXPENSE_SHARED, "Conta de luz", [ANA.id, BRUNO.id]],
    [EXPENSE_OTHERS, "Presente surpresa", [ANA.id, CARLA.id]],
  ] as const) {
    await m.db.insert(s.sharedExpenses).values({
      id,
      groupId: GROUP,
      createdByMember: memberOf(ANA.id),
      paidByMember: memberOf(ANA.id),
      description,
      amountCents: 200_00,
      occurredOn: "2026-11-10",
      splitMethod: "equal",
    });
    await m.db.insert(s.sharedExpenseShares).values(
      takers.map((userId) => ({
        expenseId: id,
        memberId: memberOf(userId),
        input: 1,
        shareCents: 100_00,
      })),
    );
  }
}, 120_000);

beforeEach(() => {
  signedIn.current = null;
  signedIn.recent = true;
  jar.deleted = [];
});

/** A raw query (catalog lookups); PGlite returns `{ rows }`. */
async function rawRows<T>(statement: SQL): Promise<T[]> {
  const result = (await m.db.execute(statement)) as unknown as { rows: T[] };
  return result.rows;
}

async function userTables(): Promise<string[]> {
  return (
    await rawRows<{ table_name: string }>(sql`
      select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'user_id'
      order by table_name`)
  ).map((row) => row.table_name);
}

const exportOf = async (userId: string) =>
  m.exporter.collectAccountData(
    await m.context.getUserContext(userId, { now: Date.now() }),
  );

const exportRequest = (headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/export/data", {
    headers: { "X-Requested-With": "fetch", ...headers },
  });

describe("exporting all of one's data", () => {
  it("places every table with a user_id in exactly one list", async () => {
    const exported = new Set<string>(m.exporter.EXPORTED_USER_TABLES);
    const left = new Set(Object.keys(m.exporter.NOT_EXPORTED_USER_TABLES));
    for (const table of await userTables()) {
      expect(exported.has(table) !== left.has(table), table).toBe(true);
    }
    for (const table of exported) expect(left.has(table), table).toBe(false);
  });

  it("holds only the person's rows and, of a group, names and their part", async () => {
    const data = await exportOf(BRUNO.id);
    const text = JSON.stringify(data);
    expect(data.profile).toMatchObject({ id: BRUNO.id, email: BRUNO.email });
    expect(data.transactions.map((row) => row.description)).toEqual([
      "Mercado do Bruno",
    ]);
    expect(text).not.toContain("Segredo da Ana");
    expect(text).not.toContain(anaTxnId);
    expect(text).not.toContain("Conta de Ana");
    expect(text).not.toContain(ANA.email);
    expect(text).not.toContain(CARLA.email);

    type Joined = Extract<
      (typeof data.sharing.groups)[number],
      { expenses: unknown }
    >;
    const group = data.sharing.groups[0] as Joined | undefined;
    expect(group).toMatchObject({ name: "Casa", myStatus: "active" });
    if (!group) throw new Error("grupo");
    expect(group.members.map((row) => row.displayName)).toEqual(
      expect.arrayContaining(["Ana", "Bruno", "Carla", null]),
    );
    expect(group.members).toHaveLength(4);
    expect(text).not.toContain("dora@exemplo.com");
    expect(group.expenses).toEqual([
      expect.objectContaining({
        id: EXPENSE_SHARED,
        amountCents: 200_00,
        myShareCents: 100_00,
      }),
    ]);
    expect(text).not.toContain("Presente surpresa");
  });

  it("never holds a token, a password hash, a passkey key or a push endpoint", async () => {
    const data = await exportOf(BRUNO.id);
    const text = JSON.stringify(data);
    for (const secret of Object.values(SECRETS)) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain("p256dh-secreto");
    expect(data.access).toMatchObject({
      hasPassword: true,
      passkeys: [{ name: "iPhone", deviceType: "multiDevice", backedUp: true }],
      sessions: [expect.objectContaining({ userAgent: "Firefox" })],
      pushDevices: [expect.objectContaining({ userAgent: null })],
    });
  });

  it("keeps money in integer cents and tags by id", async () => {
    const data = await exportOf(BRUNO.id);
    expect(data.accounts[0]?.initialBalanceCents).toBe(123_45);
    expect(data.transactions[0]?.amountCents).toBe(-64_50);
    expect(data.transactions[0]?.tagIds).toEqual([brunoTagId]);
    expect(Number.isInteger(data.transactions[0]?.amountCents)).toBe(true);
  });

  it("zips the JSON, the ledger CSV and the readme", async () => {
    const ctx = await m.context.getUserContext(BRUNO.id, { now: Date.now() });
    const { bytes, filename } = await m.exporter.buildAccountDataArchive(ctx);
    expect(filename).toBe(`prumo-dados-${ctx.todayIso}.zip`);
    const files = unzipSync(bytes);
    const json = JSON.parse(
      strFromU8(files["prumo-dados.json"] ?? new Uint8Array()),
    );
    expect(json).toMatchObject({ format: "prumo-export", version: 1 });
    const { transactionsCsv } = await import("@/lib/import/export");
    const { listExportRows } = await import("./domain/imports");
    // TextDecoder keeps the BOM the Excel needs only with ignoreBOM.
    const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      files["lancamentos.csv"],
    );
    expect(csv).toBe(transactionsCsv(await listExportRows(ctx, {})));
    expect(strFromU8(files["LEIA-ME.txt"] ?? new Uint8Array())).toContain(
      "Cópia dos seus dados no Prumo",
    );
  });
});

describe("GET /api/export/data", () => {
  it("answers 401 signed out, 403 without a recent sign-in, 400 without the header", async () => {
    expect((await m.route.GET(exportRequest())).status).toBe(401);
    signedIn.current = CARLA;
    signedIn.recent = false;
    const stale = await m.route.GET(exportRequest());
    expect(stale.status).toBe(403);
    expect(await stale.json()).toMatchObject({
      error: {
        code: "REAUTH_REQUIRED",
        message: "Por segurança, entre de novo para continuar.",
      },
    });
    signedIn.recent = true;
    const bare = await m.route.GET(
      new Request("http://localhost:3000/api/export/data"),
    );
    expect(bare.status).toBe(400);
  });

  it("sends the ZIP, audits it without content, and allows 3 in 10 minutes", async () => {
    signedIn.current = CARLA;
    const response = await m.route.GET(exportRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="prumo-dados-\d{4}-\d{2}-\d{2}\.zip"$/,
    );
    const body = new Uint8Array(await response.arrayBuffer());
    expect(strFromU8(body.subarray(0, 2))).toBe("PK");
    const [entry] = await m.db
      .select()
      .from(m.schema.auditLog)
      .where(
        and(
          eq(m.schema.auditLog.action, "data.exported"),
          eq(m.schema.auditLog.actorId, CARLA.id),
        ),
      );
    expect(entry).toMatchObject({
      actorName: "Carla",
      targetUserId: null,
      metadata: {},
    });

    expect((await m.route.GET(exportRequest())).status).toBe(200);
    expect((await m.route.GET(exportRequest())).status).toBe(200);
    const limited = await m.route.GET(exportRequest());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

describe("deleting one's own account", () => {
  it("refuses without a recent sign-in, before anything else", async () => {
    signedIn.current = CARLA;
    signedIn.recent = false;
    const result = await m.actions.deleteOwnAccountAction({
      confirmEmail: CARLA.email,
    });
    expect(result?.serverError).toBe(
      "Por segurança, entre de novo para continuar.",
    );
    expect(jar.deleted).toEqual([]);
  });

  it("explains and refuses the owner's account and the last administrator", async () => {
    expect(await m.users.selfDeleteStatus(ANA.id)).toEqual({
      blocker: "A conta do dono do app não pode ser excluída.",
    });
    await expect(m.users.deleteOwnAccount(ANA.id, ANA.email)).rejects.toThrow(
      "A conta do dono do app não pode ser excluída.",
    );
    expect(await m.users.selfDeleteStatus(BRUNO.id)).toEqual({ blocker: null });
    // Bia may go while Ana is an active administrator…
    expect(await m.users.selfDeleteStatus(BIA.id)).toEqual({ blocker: null });
    // …but not once she is the only one (Ana demoted, without OWNER_EMAIL
    // pointing at Bia).
    await m.db
      .update(m.schema.user)
      .set({ role: "user" })
      .where(eq(m.schema.user.id, ANA.id));
    try {
      const last =
        "Você é o único administrador ativo. Torne outra pessoa administradora antes de excluir a sua conta.";
      expect(await m.users.selfDeleteStatus(BIA.id)).toEqual({ blocker: last });
      await expect(m.users.deleteOwnAccount(BIA.id, BIA.email)).rejects.toThrow(
        last,
      );
    } finally {
      await m.db
        .update(m.schema.user)
        .set({ role: "admin" })
        .where(eq(m.schema.user.id, ANA.id));
    }
  });

  it("refuses an account that does not exist", async () => {
    await expect(
      m.users.deleteOwnAccount("ninguem", "ninguem@exemplo.com"),
    ).rejects.toThrow("Você não tem permissão para fazer isso.");
  });

  it("asks for the e-mail, then removes every row of the person and nothing else", async () => {
    const tables = await userTables();
    const rowsOf = async (userId: string) => {
      const counts: Record<string, number> = {};
      for (const table of tables) {
        const [row] = await rawRows<{ total: number }>(
          sql`select count(*)::int as total from ${sql.identifier(table)} where user_id = ${userId}`,
        );
        counts[table] = row?.total ?? 0;
      }
      return counts;
    };
    const anaBefore = await rowsOf(ANA.id);
    signedIn.current = BRUNO;

    const wrong = await m.actions.deleteOwnAccountAction({
      confirmEmail: "outro@exemplo.com",
    });
    expect(wrong?.serverError).toBe(
      "Digite o e-mail da sua conta para confirmar.",
    );
    expect(jar.deleted).toEqual([]);
    expect((await rowsOf(BRUNO.id)).transactions).toBe(1);

    const done = await m.actions.deleteOwnAccountAction({
      confirmEmail: " BRUNO@exemplo.com ",
    });
    expect(done?.data).toEqual({ ok: true });
    // Cookies untouched: changing them would re-render the page and send
    // the person to /entrar before the client's own /entrar?excluida=1.
    expect(jar.deleted).toEqual([]);

    const after = await rowsOf(BRUNO.id);
    for (const table of tables) expect(after[table], table).toBe(0);
    const [left] = await m.db
      .select({ total: count() })
      .from(m.schema.user)
      .where(eq(m.schema.user.id, BRUNO.id));
    expect(left?.total).toBe(0);
    // In the group Bruno stays by name, without the account.
    const [member] = await m.db
      .select()
      .from(m.schema.shareMembers)
      .where(
        and(
          eq(m.schema.shareMembers.groupId, GROUP),
          eq(m.schema.shareMembers.displayName, "Bruno"),
        ),
      );
    expect(member).toMatchObject({ userId: null, status: "left" });
    expect(await rowsOf(ANA.id)).toEqual(anaBefore);

    const [entry] = await m.db
      .select()
      .from(m.schema.auditLog)
      .where(eq(m.schema.auditLog.action, "user.self_deleted"));
    expect(entry).toMatchObject({
      actorId: null,
      actorName: "Bruno",
      targetUserId: null,
      targetName: "Bruno",
      targetEmail: BRUNO.email,
      metadata: { role: "user" },
    });
  });
});
