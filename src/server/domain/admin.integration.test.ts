// Administração against a real (in-memory) Postgres and the real Better Auth
// configuration: every admin action refuses a non-administrator, the guards
// (self, last administrator), invites and resets end to end (create → accept
// → sign in), deactivation, deleting an account with all its data, the audit
// trail and per-person flags.
import { and, count, eq, type SQL, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
// Outside a Next.js request there is no cookie store to write to.
vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "next-cookies" }),
}));
// Who calls the Server Actions; normally read from the session cookie.
const caller = vi.hoisted(() => ({
  current: null as null | {
    id: string;
    name: string;
    email: string;
    role: "admin" | "user";
  },
}));
vi.mock("@/server/dal", () => ({
  getAdmin: async () =>
    caller.current?.role === "admin" ? caller.current : null,
  requireUser: async () => {
    if (!caller.current) throw new Error("sem sessão");
    return caller.current;
  },
  getSession: async () => null,
}));

process.env.DATABASE_URL = "pglite:memory";
process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.OWNER_EMAIL = "ana@exemplo.com";

const PASSWORD = "uma senha bem longa";
const LINKS = { origin: "http://localhost:3000" };
const NOT_ALLOWED = "Você não tem permissão para fazer isso.";

type Modules = {
  db: typeof import("../db/client")["db"];
  schema: typeof import("../db/schema");
  auth: typeof import("../auth")["auth"];
  users: typeof import("./users");
  links: typeof import("./access-links");
  flags: typeof import("./flag-admin");
  audit: typeof import("./audit");
  actions: typeof import("../actions/admin");
};
let m: Modules;

const ANA = {
  id: "ana",
  name: "Ana Souza",
  email: "ana@exemplo.com",
  role: "admin" as const,
};

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("../db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("../db/schema");
  const authModule = await import("../auth");
  await client.db.insert(schema.user).values({ ...ANA, emailVerified: true });
  const context = await authModule.auth.$context;
  await client.db.insert(schema.account).values({
    id: "account-ana",
    accountId: ANA.id,
    providerId: "credential",
    userId: ANA.id,
    password: await context.password.hash(PASSWORD),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const { ensureOwnerDefaults } = await import("../db/seed-defaults");
  await ensureOwnerDefaults(ANA.id);
  m = {
    db: client.db,
    schema,
    auth: authModule.auth,
    users: await import("./users"),
    links: await import("./access-links"),
    flags: await import("./flag-admin"),
    audit: await import("./audit"),
    actions: await import("../actions/admin"),
  };
}, 120_000);

const tokenOf = (url: string) => new URL(url).pathname.split("/").at(-1) ?? "";

async function hashPassword(password: string) {
  return (await m.auth.$context).password.hash(password);
}

/** Creates an account through the invite flow and returns its id. */
async function invite(
  name: string,
  email: string,
  role: "admin" | "user" = "user",
) {
  const created = await m.users.createUserWithInvite(
    ANA.id,
    { name, email, role },
    LINKS,
  );
  return { id: created.user.id, token: tokenOf(created.url), created };
}

async function accept(token: string, password = PASSWORD) {
  return m.links.acceptAccessLink(token, {
    passwordHash: await hashPassword(password),
    removePasskeys: false,
  });
}

const signIn = (email: string, password = PASSWORD) =>
  m.auth.api.signInEmail({ body: { email, password } });

async function sessionsOf(userId: string) {
  const [row] = await m.db
    .select({ total: count() })
    .from(m.schema.session)
    .where(eq(m.schema.session.userId, userId));
  return row?.total ?? 0;
}

/** A raw query (catalog lookups); PGlite returns `{ rows }`. */
async function rawRows<T>(statement: SQL): Promise<T[]> {
  const result = (await m.db.execute(statement)) as unknown as { rows: T[] };
  return result.rows;
}

async function auditCount() {
  const [row] = await m.db.select({ total: count() }).from(m.schema.auditLog);
  return row?.total ?? 0;
}

describe("invites", () => {
  it("creates an account without a password and an invite that lets the person in", async () => {
    const { id, token, created } = await invite(
      "Bruno Lima",
      " Bruno@Exemplo.com ",
    );
    expect(created.user.email).toBe("bruno@exemplo.com");
    expect(created.purpose).toBe("invite");
    expect(created.url).toMatch(
      /^http:\/\/localhost:3000\/convite\/[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/,
    );
    const expires = new Date(created.expiresAt).getTime() - Date.now();
    expect(expires).toBeGreaterThan(71.9 * 3600_000);
    expect(expires).toBeLessThanOrEqual(72 * 3600_000);

    // Only the SHA-256 of the verifier is stored.
    const [link] = await m.db
      .select()
      .from(m.schema.accessLinks)
      .where(eq(m.schema.accessLinks.userId, id));
    const verifier = token.split(".")[1] ?? "";
    expect(link?.selector).toBe(token.split(".")[0]);
    expect(link?.verifierHash).not.toContain(verifier);
    expect(JSON.stringify(link)).not.toContain(verifier);

    // No password yet: it cannot sign in.
    await expect(signIn("bruno@exemplo.com")).rejects.toThrow();
    const list = await m.users.listUsersForAdmin(ANA.id);
    expect(list.find((row) => row.id === id)?.status).toBe("invite_pending");

    const info = await m.links.inspectAccessLink(token);
    expect(info).toMatchObject({
      state: "valid",
      purpose: "invite",
      firstName: "Bruno",
      email: "bruno@exemplo.com",
    });

    const accepted = await accept(token);
    expect(accepted).toEqual({
      userId: id,
      email: "bruno@exemplo.com",
      purpose: "invite",
    });
    const session = await signIn("bruno@exemplo.com");
    expect(session.token).toBeTruthy();
    const after = await m.users.listUsersForAdmin(ANA.id);
    const bruno = after.find((row) => row.id === id);
    expect(bruno?.status).toBe("active");
    expect(bruno?.sessions).toBe(1);
    expect(bruno?.lastActiveAt).not.toBeNull();
    expect(bruno?.openLink).toBeNull();
  });

  it("refuses an e-mail that already has an account", async () => {
    await expect(invite("Outra Ana", "ANA@exemplo.com")).rejects.toThrow(
      "Já existe uma conta com este e-mail.",
    );
  });

  it("uses a link once", async () => {
    const { token } = await invite("Davi", "davi@exemplo.com");
    await accept(token);
    expect((await m.links.inspectAccessLink(token))?.state).toBe("used");
    await expect(accept(token, "outra senha bem longa")).rejects.toThrow(
      m.links.LINK_UNAVAILABLE,
    );
    // The first password still works; the second never applied.
    expect((await signIn("davi@exemplo.com")).token).toBeTruthy();
    await expect(
      signIn("davi@exemplo.com", "outra senha bem longa"),
    ).rejects.toThrow();
  });

  it("refuses an expired link", async () => {
    const { id } = await invite("Elisa", "elisa@exemplo.com");
    const longAgo = new Date(Date.now() - 73 * 3600_000);
    const old = await m.users.createAccessLink(ANA.id, id, {
      ...LINKS,
      now: longAgo,
    });
    const token = tokenOf(old.url);
    expect((await m.links.inspectAccessLink(token))?.state).toBe("expired");
    await expect(accept(token)).rejects.toThrow(m.links.LINK_UNAVAILABLE);
    const list = await m.users.listUsersForAdmin(ANA.id);
    expect(list.find((row) => row.id === id)?.status).toBe("invite_expired");
  });

  it("invalidates the previous link when a new one is made", async () => {
    const { id, token: first } = await invite("Fábio", "fabio@exemplo.com");
    const second = tokenOf(
      (await m.users.createAccessLink(ANA.id, id, LINKS)).url,
    );
    expect((await m.links.inspectAccessLink(first))?.state).toBe("revoked");
    await expect(accept(first)).rejects.toThrow(m.links.LINK_UNAVAILABLE);
    await accept(second);
    expect((await signIn("fabio@exemplo.com")).token).toBeTruthy();
  });

  it("treats a wrong or malformed token as no link at all", async () => {
    const { token } = await invite("Gabi", "gabi@exemplo.com");
    const [selector] = token.split(".");
    const forged = `${selector}.${"A".repeat(43)}`;
    expect(await m.links.inspectAccessLink(forged)).toBeNull();
    expect(await m.links.inspectAccessLink("nada")).toBeNull();
    expect(await m.links.inspectAccessLink(`${token}x`)).toBeNull();
    await expect(accept(forged)).rejects.toThrow(m.links.LINK_UNAVAILABLE);
    expect((await m.links.inspectAccessLink(token))?.state).toBe("valid");
  });

  it("can be invalidated by an administrator", async () => {
    const { id, token } = await invite("Heitor", "heitor@exemplo.com");
    await m.users.revokeAccessLink(ANA.id, id);
    expect((await m.links.inspectAccessLink(token))?.state).toBe("revoked");
    await expect(m.users.revokeAccessLink(ANA.id, id)).rejects.toThrow(
      "Esta conta não tem link aberto.",
    );
  });
});

describe("reset links", () => {
  it("set a new password, end the sessions and can remove passkeys", async () => {
    const { id, token } = await invite("Iara", "iara@exemplo.com");
    await accept(token);
    await signIn("iara@exemplo.com");
    await signIn("iara@exemplo.com");
    await m.db.insert(m.schema.passkey).values({
      id: "passkey-iara",
      publicKey: "chave",
      userId: id,
      credentialID: "credencial",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
    });
    expect(await sessionsOf(id)).toBe(2);

    const reset = await m.users.createAccessLink(ANA.id, id, LINKS);
    expect(reset.purpose).toBe("reset");
    await m.links.acceptAccessLink(tokenOf(reset.url), {
      passwordHash: await hashPassword("a senha nova e longa"),
      removePasskeys: true,
    });
    expect(await sessionsOf(id)).toBe(0);
    const [keys] = await m.db
      .select({ total: count() })
      .from(m.schema.passkey)
      .where(eq(m.schema.passkey.userId, id));
    expect(keys?.total).toBe(0);
    await expect(signIn("iara@exemplo.com")).rejects.toThrow();
    expect(
      (await signIn("iara@exemplo.com", "a senha nova e longa")).token,
    ).toBeTruthy();
  });
});

describe("deactivation", () => {
  it("ends every session and blocks sign-in until reactivated", async () => {
    const { id, token } = await invite("João", "joao@exemplo.com");
    await accept(token);
    await signIn("joao@exemplo.com");
    expect(await sessionsOf(id)).toBe(1);

    const result = await m.users.setUserBanned(ANA.id, id, true);
    expect(result.sessions).toBe(1);
    expect(await sessionsOf(id)).toBe(0);
    await expect(signIn("joao@exemplo.com")).rejects.toMatchObject({
      body: { code: "BANNED_USER" },
    });
    const list = await m.users.listUsersForAdmin(ANA.id);
    expect(list.find((row) => row.id === id)?.status).toBe("deactivated");

    // A link of a deactivated account does not work, and none can be made.
    await expect(m.users.createAccessLink(ANA.id, id, LINKS)).rejects.toThrow(
      /Reative/,
    );

    await m.users.setUserBanned(ANA.id, id, false);
    expect((await signIn("joao@exemplo.com")).token).toBeTruthy();
  });

  it("can end someone's sessions without deactivating", async () => {
    const { id, token } = await invite("Kátia", "katia@exemplo.com");
    await accept(token);
    await signIn("katia@exemplo.com");
    await signIn("katia@exemplo.com");
    expect((await m.users.revokeUserSessions(ANA.id, id)).sessions).toBe(2);
    expect(await sessionsOf(id)).toBe(0);
    expect((await signIn("katia@exemplo.com")).token).toBeTruthy();
  });
});

describe("guards", () => {
  it("never lets an administrator deactivate, demote, delete or reset themself", async () => {
    await expect(m.users.setUserBanned(ANA.id, ANA.id, true)).rejects.toThrow(
      "Você não pode desativar a própria conta.",
    );
    await expect(m.users.setUserRole(ANA.id, ANA.id, "user")).rejects.toThrow(
      "Você não pode remover a si mesmo dos administradores.",
    );
    await expect(
      m.users.deleteUserAccount(ANA.id, ANA.id, ANA.email),
    ).rejects.toThrow("Você não pode excluir a própria conta.");
    await expect(m.users.revokeUserSessions(ANA.id, ANA.id)).rejects.toThrow(
      /Ajustes › Segurança/,
    );
    await expect(
      m.users.createAccessLink(ANA.id, ANA.id, LINKS),
    ).rejects.toThrow(/Ajustes › Segurança/);
  });

  it("keeps an active administrator", async () => {
    const { id: lia, token } = await invite("Lia", "lia@exemplo.com", "admin");
    await accept(token);
    // Two administrators: Lia can remove Ana's role, and then Ana can do
    // nothing in the panel (the role is read inside each transaction).
    await m.users.setUserRole(lia, ANA.id, "user");
    await expect(m.users.setUserRole(ANA.id, lia, "user")).rejects.toThrow(
      NOT_ALLOWED,
    );
    await expect(m.users.setUserBanned(ANA.id, lia, true)).rejects.toThrow(
      NOT_ALLOWED,
    );
    // Lia is the last administrator now.
    await expect(m.users.setUserRole(lia, lia, "user")).rejects.toThrow();
    await m.users.setUserRole(lia, ANA.id, "admin");
    // A deactivated administrator does not count as the second one.
    await m.users.setUserBanned(ANA.id, lia, true);
    await expect(m.users.setUserRole(ANA.id, ANA.id, "user")).rejects.toThrow();
    await m.users.setUserBanned(ANA.id, lia, false);
    await m.users.setUserRole(ANA.id, lia, "user");
  });

  it("refuses the domain to anyone who is not an active administrator", async () => {
    const { id: mauro, token } = await invite("Mauro", "mauro@exemplo.com");
    await accept(token);
    await expect(
      m.users.createUserWithInvite(
        mauro,
        { name: "X", email: "x@exemplo.com", role: "admin" },
        LINKS,
      ),
    ).rejects.toThrow(NOT_ALLOWED);
    await expect(m.users.setUserRole(mauro, mauro, "admin")).rejects.toThrow(
      NOT_ALLOWED,
    );
    await expect(
      m.flags.setGlobalFlag(mauro, "importar_extrato", false),
    ).rejects.toThrow(NOT_ALLOWED);
    await expect(
      m.users.setUserBanned("nao-existe", ANA.id, true),
    ).rejects.toThrow(NOT_ALLOWED);
  });
});

describe("admin actions", () => {
  it("refuse a regular user and a signed-out caller, changing nothing", async () => {
    const before = await auditCount();
    const [users] = await m.db.select({ total: count() }).from(m.schema.user);
    const target = { userId: ANA.id };
    const calls = () => [
      m.actions.createUserAction({
        name: "Intrusa",
        email: "intrusa@exemplo.com",
        role: "admin",
      }),
      m.actions.createAccessLinkAction(target),
      m.actions.revokeAccessLinkAction(target),
      m.actions.setUserBannedAction({ ...target, banned: true }),
      m.actions.revokeUserSessionsAction(target),
      m.actions.setUserRoleAction({ ...target, role: "user" }),
      m.actions.deleteUserAction({ ...target, confirmEmail: ANA.email }),
      m.actions.setGlobalFlagAction({ key: "importar_extrato", value: false }),
      m.actions.setUserFlagAction({
        ...target,
        key: "importar_extrato",
        value: false,
      }),
    ];
    for (const who of [
      { id: "mauro", name: "Mauro", email: "m@exemplo.com", role: "user" },
      null,
    ] as const) {
      caller.current = who;
      const results = await Promise.all(calls());
      expect(results).toHaveLength(9);
      for (const result of results) {
        expect(result?.serverError).toBe(NOT_ALLOWED);
        expect(result?.data).toBeUndefined();
      }
    }
    caller.current = null;
    expect(await auditCount()).toBe(before);
    const [after] = await m.db.select({ total: count() }).from(m.schema.user);
    expect(after?.total).toBe(users?.total);
  });

  it("work for an administrator and return the link once", async () => {
    caller.current = ANA;
    const created = await m.actions.createUserAction({
      name: "Nina",
      email: "nina@exemplo.com",
      role: "user",
    });
    expect(created?.serverError).toBeUndefined();
    expect(created?.data?.url).toContain("/convite/");
    const invalid = await m.actions.createUserAction({
      name: "",
      email: "não é e-mail",
      role: "user",
    });
    expect(invalid?.validationErrors?.fieldErrors).toMatchObject({
      name: ["Informe o nome."],
      email: ["Informe um e-mail válido."],
    });
    const self = await m.actions.setUserBannedAction({
      userId: ANA.id,
      banned: true,
    });
    expect(self?.serverError).toBe("Você não pode desativar a própria conta.");
    caller.current = null;
  });
});

describe("audit trail", () => {
  it("records who did what to whom, and never a token", async () => {
    const { id, token, created } = await invite("Otávio", "otavio@exemplo.com");
    await accept(token);
    await m.users.setUserRole(ANA.id, id, "admin");
    const { items } = await m.audit.listAuditLog({ limit: 3 });
    expect(items.map((item) => item.action)).toEqual([
      "user.role_changed",
      "access_link.accepted",
      "user.created",
    ]);
    expect(items[0]).toMatchObject({
      actorId: ANA.id,
      actorName: ANA.name,
      targetUserId: id,
      targetName: "Otávio",
      targetEmail: "otavio@exemplo.com",
      metadata: { role: "admin" },
    });
    expect(items[1]).toMatchObject({
      actorId: id,
      actorName: "Otávio",
      metadata: { purpose: "invite" },
    });

    const everything = await m.db.select().from(m.schema.auditLog);
    const text = JSON.stringify(everything);
    expect(text).not.toContain(token);
    expect(text).not.toContain(token.split(".")[1]);
    expect(text).not.toContain(created.url);
  });

  it("pages from newest to oldest", async () => {
    const first = await m.audit.listAuditLog({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe(first.items[1]?.id);
    const second = await m.audit.listAuditLog({
      limit: 2,
      before: first.nextCursor,
    });
    expect(second.items[0]?.id < (first.items[1]?.id ?? "")).toBe(true);
  });
});

describe("per-person flags", () => {
  it("lists the global value and each person's own value", async () => {
    const { id: pedro } = await invite("Pedro", "pedro@exemplo.com");
    await m.flags.setGlobalFlag(ANA.id, "importar_extrato", false);
    await m.flags.setUserFlag(ANA.id, pedro, "importar_extrato", true);
    let [flag] = await m.flags.listFlagsForAdmin();
    expect(flag).toMatchObject({
      key: "importar_extrato",
      defaultValue: true,
      global: false,
      overrides: [{ userId: pedro, name: "Pedro", enabled: true }],
    });

    await m.flags.setGlobalFlag(ANA.id, "importar_extrato", null);
    await m.flags.setUserFlag(ANA.id, pedro, "importar_extrato", null);
    [flag] = await m.flags.listFlagsForAdmin();
    expect(flag).toMatchObject({ global: null, overrides: [] });

    await expect(
      m.flags.setGlobalFlag(ANA.id, "flag_que_nao_existe", true),
    ).rejects.toThrow("Flag desconhecida.");
    const { items } = await m.audit.listAuditLog({ limit: 1 });
    expect(items[0]).toMatchObject({
      action: "flag.user_set",
      targetName: "Pedro",
      metadata: { flag: "importar_extrato", value: null },
    });
  });
});

describe("deleting an account", () => {
  it("removes the account and every row of its data, and nothing else", async () => {
    const { id: rui, token } = await invite("Rui", "rui@exemplo.com");
    await accept(token);
    await signIn("rui@exemplo.com");
    const { ensureOwnerDefaults } = await import("../db/seed-defaults");
    await ensureOwnerDefaults(rui);
    const ctx = await (await import("./context")).getUserContext(rui);
    const accounts = await import("./accounts");
    const transactions = await import("./transactions");
    const checking = await accounts.createAccount(rui, {
      name: "Conta",
      type: "checking",
      initialBalanceCents: 100_000,
    });
    const savings = await accounts.createAccount(rui, {
      name: "Reserva",
      type: "investment",
      initialBalanceCents: 0,
    });
    const card = await accounts.createAccount(rui, {
      name: "Cartão",
      type: "credit_card",
      initialBalanceCents: 0,
      card: { limitCents: 100_000, closingDay: 5, dueDay: 12 },
    });
    const categories = await (await import("./categories")).listCategories(rui);
    const groceries = categories.find((row) => row.name === "Mercado")?.id;
    if (!groceries) throw new Error("categoria Mercado");
    await transactions.createTransaction(ctx, {
      kind: "expense",
      amountCents: 6_000,
      accountId: card,
      categoryId: groceries,
      description: "Parcelado",
      occurredOn: ctx.todayIso,
      installments: 3,
    });
    await transactions.createTransaction(ctx, {
      kind: "expense",
      amountCents: 9_990,
      accountId: checking,
      categoryId: groceries,
      description: "Assinatura",
      occurredOn: ctx.todayIso,
      recurrence: { freq: "monthly" },
    });
    await transactions.createTransfer(ctx, {
      fromAccountId: checking,
      toAccountId: savings,
      amountCents: 1_000,
      occurredOn: ctx.todayIso,
    });
    await (await import("./budgets")).upsertBudget(ctx, {
      categoryId: groceries,
      month: ctx.todayIso.slice(0, 7),
      amountCents: 50_000,
    });
    const goals = await import("./goals");
    const goal = await goals.createGoal(ctx, {
      name: "Viagem",
      icon: "plane",
      color: "cat-1",
      targetCents: 500_000,
      targetDate: null,
      accountId: savings,
      savedCents: 0,
      monthlyPlanCents: 10_000,
      expectedRate: null,
    });
    await goals.contributeToGoal(ctx, goal, {
      amountCents: 2_000,
      fromAccountId: checking,
    });
    const imported = await (await import("./imports")).confirmImport(ctx, {
      accountId: checking,
      format: "ofx",
      fileRows: 1,
      duplicates: 0,
      rows: [
        {
          occurredOn: ctx.todayIso,
          amountCents: -1_500,
          description: "Padaria",
          externalId: "ofx:RUI-1",
          categoryId: groceries,
        },
      ],
    });
    const s = m.schema;
    const [tag] = await m.db
      .insert(s.tags)
      .values({ userId: rui, name: "viagem" })
      .returning({ id: s.tags.id });
    const [someTxn] = await m.db
      .select({ id: s.transactions.id })
      .from(s.transactions)
      .where(eq(s.transactions.userId, rui))
      .limit(1);
    if (!tag || !someTxn) throw new Error("dados de teste");
    await m.db
      .insert(s.transactionTags)
      .values({ transactionId: someTxn.id, tagId: tag.id });
    await m.db.insert(s.accountYield).values({
      accountId: savings,
      index: "cdi",
      pctOfIndex: "1.0000",
    });
    await m.db.insert(s.balanceSnapshots).values({
      accountId: checking,
      onDate: ctx.todayIso,
      balanceCents: 100_000,
    });
    await m.db.insert(s.categorizationRules).values({
      userId: rui,
      pattern: "padaria",
      categoryId: groceries,
    });
    await m.db.insert(s.simulations).values({
      userId: rui,
      name: "Simulação",
      params: {
        initial: 1000,
        monthly: 100,
        months: 12,
        rate: { kind: "monthly", value: 0.01 },
        mode: "future_value",
      },
    });
    await m.db.insert(s.notifications).values({
      userId: rui,
      type: "goal_reached",
      dedupeKey: "goal:x",
      payload: { type: "goal_reached", goalId: goal, goalName: "Viagem" },
    });
    await m.db.insert(s.pushSubscriptions).values({
      userId: rui,
      endpoint: "https://push.exemplo.com/rui",
      p256dh: "p",
      auth: "a",
    });
    await m.db.insert(s.featureFlagOverrides).values({
      userId: rui,
      key: "importar_extrato",
      enabled: false,
    });
    await m.users.createAccessLink(ANA.id, rui, LINKS);
    expect(imported.imported).toBe(1);

    // Every table with a user_id column, found from the catalog, so a new
    // table without ON DELETE CASCADE makes this test fail.
    const tables = (
      await rawRows<{ table_name: string }>(sql`
        select table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'user_id'
        order by table_name`)
    ).map((row) => row.table_name);
    expect(tables.length).toBeGreaterThan(15);
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
    const ruiBefore = await rowsOf(rui);
    for (const table of [
      "fin_accounts",
      "transactions",
      "card_invoices",
      "installment_plans",
      "recurrences",
      "goals",
      "budgets",
      "categories",
      "tags",
      "imports",
      "categorization_rules",
      "simulations",
      "notifications",
      "push_subscriptions",
      "user_settings",
      "session",
      "account",
      "access_links",
      "feature_flag_overrides",
    ]) {
      expect(ruiBefore[table], table).toBeGreaterThan(0);
    }
    const anaBefore = await rowsOf(ANA.id);

    await expect(
      m.users.deleteUserAccount(ANA.id, rui, "outro@exemplo.com"),
    ).rejects.toThrow("Digite o e-mail da conta para confirmar.");
    const deleted = await m.users.deleteUserAccount(
      ANA.id,
      rui,
      " RUI@exemplo.com ",
    );
    expect(deleted).toEqual({ name: "Rui", email: "rui@exemplo.com" });

    const ruiAfter = await rowsOf(rui);
    for (const table of tables) expect(ruiAfter[table], table).toBe(0);
    const [person] = await m.db
      .select({ total: count() })
      .from(s.user)
      .where(eq(s.user.id, rui));
    expect(person?.total).toBe(0);
    // Tables keyed by an account, a transaction or a tag, not by the user.
    for (const [table, column, ids] of [
      ["credit_card_details", s.creditCardDetails.accountId, [card]],
      ["account_yield", s.accountYield.accountId, [savings]],
      ["balance_snapshots", s.balanceSnapshots.accountId, [checking]],
    ] as const) {
      const rows = await m.db
        .select({ total: count() })
        .from(
          table === "credit_card_details"
            ? s.creditCardDetails
            : table === "account_yield"
              ? s.accountYield
              : s.balanceSnapshots,
        )
        .where(eq(column, ids[0]));
      expect(rows[0]?.total, table).toBe(0);
    }
    const [tagged] = await m.db
      .select({ total: count() })
      .from(s.transactionTags)
      .where(eq(s.transactionTags.tagId, tag.id));
    expect(tagged?.total).toBe(0);

    // Other people's data is untouched.
    expect(await rowsOf(ANA.id)).toEqual(anaBefore);
    // The audit keeps the name and e-mail; the link to the account is gone.
    const [entry] = await m.db
      .select()
      .from(s.auditLog)
      .where(
        and(
          eq(s.auditLog.action, "user.deleted"),
          eq(s.auditLog.targetEmail, "rui@exemplo.com"),
        ),
      );
    expect(entry).toMatchObject({
      actorId: ANA.id,
      targetUserId: null,
      targetName: "Rui",
    });
    await expect(signIn("rui@exemplo.com")).rejects.toThrow();
  });
});
