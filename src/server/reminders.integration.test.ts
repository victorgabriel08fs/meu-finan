// The daily notices (step sendReminders) against a real (in-memory)
// Postgres, with the push service mocked, on Monday 09/nov/2026 at 06:15 in
// São Paulo: who gets which notice, with and without amounts, and a second
// run the same day sending nothing again. Then each notice once whatever
// happens (runs at the same time, a push service that fails or forgot the
// device, the deadline, a week of bills), the job_runs report with counts
// only, and the number on the icon.
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  refresh: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
// runDailyJob also syncs the market rates: no network in the tests.
vi.mock("./jobs/bcb-sgs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./jobs/bcb-sgs")>()),
  fetchSgsSeries: async () => {
    throw new Error("offline");
  },
}));
// The signed-in administrator for the preview, normally from the session.
const signedIn = vi.hoisted(() => ({
  admin: null as null | { id: string; name: string; role: string },
}));
vi.mock("@/server/dal", () => ({
  requireUser: async () => null,
  getAdmin: async () => signedIn.admin,
  getSession: async () => null,
}));
// The push service: records what would be sent; an endpoint listed in
// `status` answers with that error instead.
const pushService = vi.hoisted(() => ({
  sent: [] as { endpoint: string; body: Record<string, unknown> }[],
  status: new Map<string, number>(),
}));
vi.mock("web-push", () => {
  class WebPushError extends Error {
    readonly body = "";
    constructor(
      message: string,
      readonly statusCode: number,
    ) {
      super(message);
    }
  }
  return {
    WebPushError,
    default: {
      sendNotification: async (target: { endpoint: string }, body: string) => {
        const status = pushService.status.get(target.endpoint);
        if (status) throw new WebPushError(`status ${status}`, status);
        pushService.sent.push({
          endpoint: target.endpoint,
          body: JSON.parse(body),
        });
        return { statusCode: 201, body: "", headers: {} };
      },
    },
  };
});
process.env.DATABASE_URL = "pglite:memory";
process.env.VAPID_PUBLIC_KEY =
  "BHo9sGkrAC15LBWdZf8DzB4o5Oce3K2Js_UnloBhFgaD_m5GWx-Z79ffAfiwzHG06Gyz2shMI9viJlceytrQniY";
process.env.VAPID_PRIVATE_KEY = "CirzHWrUhgY50jjnZNdG5uw85M89d44Z-b8WFvJzj2I";

type Modules = {
  db: typeof import("./db/client")["db"];
  schema: typeof import("./db/schema");
  reminders: typeof import("./reminders");
};
let m: Modules;

// Monday, 09/nov/2026, 06:15 in São Paulo.
const NOW = new Date(Date.UTC(2026, 10, 9, 9, 15));
const KEYS = {
  p256dh:
    "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};
const endpointOf = (userId: string) => `https://web.push.apple.com/${userId}`;

const run = () =>
  m.reminders.sendDailyReminders({ now: NOW, deadline: Date.now() + 60_000 });

const sentTo = (userId: string) =>
  pushService.sent
    .filter((push) => push.endpoint === endpointOf(userId))
    .map(
      (push) =>
        push.body as {
          title: string;
          body: string;
          tag: string;
          badge: number;
        },
    );

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("./db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("./db/schema");
  const { ensureOwnerDefaults } = await import("./db/seed-defaults");
  const { eq } = await import("drizzle-orm");
  const db = client.db;

  await db.insert(schema.user).values([
    { id: "ana", name: "Ana", email: "ana@exemplo.com", role: "admin" },
    { id: "bruno", name: "Bruno", email: "bruno@exemplo.com" },
    { id: "carla", name: "Carla", email: "carla@exemplo.com" },
    { id: "davi", name: "Davi", email: "davi@exemplo.com" },
    { id: "edu", name: "Edu", email: "edu@exemplo.com", banned: true },
  ]);
  for (const id of ["ana", "bruno", "carla", "davi", "edu"]) {
    await ensureOwnerDefaults(id);
  }
  // Ana: everything on, amounts shown, financial month from the 9th.
  await db
    .update(schema.userSettings)
    .set({
      monthStartDay: 9,
      notificationPrefs: {
        events: {
          daily_summary: true,
          bills_due: true,
          income_countdown: true,
          weekly_summary: true,
          monthly_summary: true,
        },
        billsLeadDays: 1,
        showAmounts: true,
      },
    })
    .where(eq(schema.userSettings.userId, "ana"));
  // Carla has a device but not the flag; Davi the flag but no device.
  await db.insert(schema.featureFlagOverrides).values(
    ["ana", "bruno", "davi", "edu"].map((userId) => ({
      userId,
      key: "notificacoes_push",
      enabled: true,
    })),
  );
  await db.insert(schema.pushSubscriptions).values(
    ["ana", "bruno", "carla", "edu"].map((userId) => ({
      userId,
      endpoint: endpointOf(userId),
      ...KEYS,
    })),
  );

  const { createAccount } = await import("./domain/accounts");
  const { listCategories } = await import("./domain/categories");
  const { createTransaction } = await import("./domain/transactions");
  const { upsertBudget } = await import("./domain/budgets");
  const { getUserContext, resolvePeriod } = await import("./domain/context");

  const seed = async (
    userId: string,
    entries: {
      kind: "income" | "expense";
      category: string;
      description: string;
      amountCents: number;
      occurredOn: string;
      paid?: boolean;
    }[],
  ) => {
    const ctx = await getUserContext(userId, { now: NOW.getTime() });
    const accountId = await createAccount(userId, {
      name: "Conta Principal",
      type: "checking",
      initialBalanceCents: 500_000,
    });
    const categories = await listCategories(userId);
    const categoryId = (name: string) => {
      const found = categories.find((category) => category.name === name);
      if (!found) throw new Error(`categoria ${name}`);
      return found.id;
    };
    for (const { category, ...entry } of entries) {
      await createTransaction(ctx, {
        ...entry,
        accountId,
        categoryId: categoryId(category),
      });
    }
    return { ctx, categoryId };
  };

  const ana = await seed("ana", [
    // History: four weeks of R$ 200 at the market, then R$ 120 last week.
    ...["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"].map(
      (occurredOn) => ({
        kind: "expense" as const,
        category: "Mercado",
        description: "Mercado",
        amountCents: 20_000,
        occurredOn,
      }),
    ),
    {
      kind: "expense",
      category: "Mercado",
      description: "Mercado",
      amountCents: 12_000,
      occurredOn: "2026-11-03",
    },
    {
      kind: "income",
      category: "Freelance",
      description: "Freela",
      amountCents: 50_000,
      occurredOn: "2026-11-04",
    },
    {
      kind: "expense",
      category: "Contas da casa",
      description: "Internet",
      amountCents: 9990,
      occurredOn: "2026-11-09",
      paid: false,
    },
    {
      kind: "expense",
      category: "Moradia",
      description: "Aluguel",
      amountCents: 210_000,
      occurredOn: "2026-11-10",
    },
    {
      kind: "income",
      category: "Salário",
      description: "Salário",
      amountCents: 795_000,
      occurredOn: "2026-11-14",
    },
  ]);
  await upsertBudget(ana.ctx, {
    categoryId: ana.categoryId("Mercado"),
    month: resolvePeriod(ana.ctx).month,
    amountCents: 80_000,
  });
  await seed("bruno", [
    {
      kind: "expense",
      category: "Mercado",
      description: "Feira",
      amountCents: 8_000,
      occurredOn: "2026-11-07",
    },
    {
      kind: "expense",
      category: "Moradia",
      description: "Condomínio",
      amountCents: 65_000,
      occurredOn: "2026-11-10",
    },
  ]);
  await seed("edu", [
    {
      kind: "expense",
      category: "Moradia",
      description: "Aluguel",
      amountCents: 150_000,
      occurredOn: "2026-11-10",
    },
  ]);

  m = { db, schema, reminders: await import("./reminders") };
}, 120_000);

beforeEach(() => {
  pushService.sent = [];
  pushService.status.clear();
});

describe("sendDailyReminders", () => {
  it("sends each person the notices they left on, and nothing to anyone else", async () => {
    const report = await run();
    expect(report).toMatchObject({
      recipients: 2,
      processed: 2,
      notReached: 0,
      sent: {
        daily_summary: 1,
        bills_due: 2,
        income_countdown: 1,
        weekly_summary: 2,
        monthly_summary: 1,
      },
      alreadySent: 0,
      undelivered: 0,
      errors: 0,
    });

    const ana = sentTo("ana");
    expect(ana.map((push) => push.tag)).toEqual([
      "resumo-dia",
      "contas",
      "receita",
      "resumo-semana",
      "resumo-mes",
    ]);
    for (const push of ana) expect(push.body).toMatch(/R\$/);
    expect(ana[1]?.title).toBe("2 contas vencem em breve");
    expect(ana[2]?.title).toBe("Salário em 5 dias");
    // The forecast would allow R$ 476,02 a day; the budget (R$ 800 over the
    // 30 days from the 9th) allows R$ 26,66, as in the Resumo do dia.
    expect(ana[2]?.body.replaceAll(" ", " ")).toBe(
      "Faltam 5 dias para receber R$ 7.950,00 (sáb, 14 nov). Até lá, dá para gastar R$ 26,66 por dia.",
    );
    expect(ana[0]?.body).toContain("Dá para gastar R$ 26,66 hoje.");
    expect(ana[3]?.title).toBe("Sua semana: 2/nov – 8/nov");

    // Bruno keeps the defaults: no amounts, no daily summary or income, and
    // his financial month starts on the 1st (no monthly summary today).
    const bruno = sentTo("bruno");
    expect(bruno.map((push) => push.tag)).toEqual(["contas", "resumo-semana"]);
    expect(bruno[0]).toMatchObject({
      title: "Condomínio vence amanhã",
      body: "Sai da Conta Principal. Toque para ver e marcar como pago.",
    });
    for (const push of bruno) {
      expect(`${push.title} ${push.body}`).not.toMatch(/R\$/);
    }

    for (const userId of ["carla", "davi", "edu"]) {
      expect(sentTo(userId)).toEqual([]);
    }
  });

  it("does not send again the same day", async () => {
    const report = await run();
    expect(pushService.sent).toEqual([]);
    expect(report).toMatchObject({
      recipients: 2,
      alreadySent: 7,
      sent: {
        daily_summary: 0,
        bills_due: 0,
        income_countdown: 0,
        weekly_summary: 0,
        monthly_summary: 0,
      },
    });
    const rows = await m.db
      .select({
        userId: m.schema.notifications.userId,
        dedupeKey: m.schema.notifications.dedupeKey,
      })
      .from(m.schema.notifications);
    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.dedupeKey)).toContain("bills_due:2026-11-09");
  });
});

describe("preview (administrators)", () => {
  const notices = () =>
    m.db.select({ id: m.schema.notifications.id }).from(m.schema.notifications);

  it("sends every notice left on to that device only, and records nothing", async () => {
    await m.db.insert(m.schema.pushSubscriptions).values({
      userId: "ana",
      endpoint: "https://fcm.googleapis.com/fcm/send/ana-notebook",
      ...KEYS,
    });
    const before = (await notices()).length;
    const outcome = await m.reminders.previewReminders(
      "ana",
      endpointOf("ana"),
      NOW,
    );
    expect(outcome).toEqual({ built: 5, sent: 5, removed: false });
    expect(pushService.sent.map((push) => push.endpoint)).toEqual(
      Array(5).fill(endpointOf("ana")),
    );
    expect(sentTo("ana").map((push) => push.tag)).toEqual([
      "previa-daily_summary",
      "previa-bills_due",
      "previa-income_countdown",
      "previa-weekly_summary",
      "previa-monthly_summary",
    ]);
    expect((await notices()).length).toBe(before);
  });

  it("never reaches someone else's device", async () => {
    const outcome = await m.reminders.previewReminders(
      "ana",
      endpointOf("bruno"),
      NOW,
    );
    expect(outcome.sent).toBe(0);
    expect(pushService.sent).toEqual([]);
  });

  it("is only for administrators, a few times a minute", async () => {
    const { previewRemindersAction } = await import("./actions/notifications");
    signedIn.admin = null;
    const refused = await previewRemindersAction({
      endpoint: endpointOf("bruno"),
    });
    expect(refused.serverError).toBeDefined();
    expect(pushService.sent).toEqual([]);

    signedIn.admin = { id: "ana", name: "Ana", role: "admin" };
    const first = await previewRemindersAction({ endpoint: endpointOf("ana") });
    // The action reads the real clock: how many depends on the day.
    expect(first.data?.sent).toBeGreaterThan(0);
    expect(
      pushService.sent.every((push) => push.endpoint === endpointOf("ana")),
    ).toBe(true);
    await previewRemindersAction({ endpoint: endpointOf("ana") });
    await previewRemindersAction({ endpoint: endpointOf("ana") });
    const fourth = await previewRemindersAction({
      endpoint: endpointOf("ana"),
    });
    expect(fourth.serverError).toBe(
      "Você já enviou algumas prévias. Espere um minuto e tente de novo.",
    );
    signedIn.admin = null;
  });
});

describe("each notice once, whatever happens", () => {
  // Hilo lives in Honolulu: at 09:15 UTC it is still Sunday 08/nov there.
  // Fabi wants only Contas a vencer, 3 days ahead, with four bills in a row.
  const FABI_BILLS = [
    ["Água", "2026-11-09"],
    ["Gás", "2026-11-10"],
    ["Escola", "2026-11-11"],
    ["Seguro", "2026-11-12"],
  ] as const;
  /** Ana 5, Bruno 2, Hilo 1, Fabi 1 on Monday 09/nov. */
  const MONDAY_NOTICES = 9;

  /** 06:15 in São Paulo on another day of November 2026. */
  const morningOf = (day: number) => new Date(Date.UTC(2026, 10, day, 9, 15));

  const resetNotices = async () => {
    await m.db.delete(m.schema.notifications);
  };

  const sentTotal = (report: { sent: Record<string, number> }) =>
    Object.values(report.sent).reduce((sum, count) => sum + count, 0);

  const noticesOf = async (userId: string) => {
    const { eq } = await import("drizzle-orm");
    return m.db
      .select({
        dedupeKey: m.schema.notifications.dedupeKey,
        payload: m.schema.notifications.payload,
      })
      .from(m.schema.notifications)
      .where(eq(m.schema.notifications.userId, userId));
  };

  beforeAll(async () => {
    const { eq } = await import("drizzle-orm");
    const { ensureOwnerDefaults } = await import("./db/seed-defaults");
    const { createAccount } = await import("./domain/accounts");
    const { listCategories } = await import("./domain/categories");
    const { createTransaction } = await import("./domain/transactions");
    const { getUserContext } = await import("./domain/context");

    // One device each: Ana's second one belonged to the preview.
    await m.db
      .delete(m.schema.pushSubscriptions)
      .where(
        eq(
          m.schema.pushSubscriptions.endpoint,
          "https://fcm.googleapis.com/fcm/send/ana-notebook",
        ),
      );
    await m.db.insert(m.schema.user).values([
      { id: "hilo", name: "Hilo", email: "hilo@exemplo.com" },
      { id: "fabi", name: "Fabi", email: "fabi@exemplo.com" },
    ]);
    for (const id of ["hilo", "fabi"]) await ensureOwnerDefaults(id);
    await m.db
      .update(m.schema.userSettings)
      .set({ timezone: "Pacific/Honolulu" })
      .where(eq(m.schema.userSettings.userId, "hilo"));
    await m.db
      .update(m.schema.userSettings)
      .set({
        notificationPrefs: {
          events: {
            daily_summary: false,
            bills_due: true,
            income_countdown: false,
            weekly_summary: false,
            monthly_summary: false,
          },
          billsLeadDays: 3,
          showAmounts: false,
        },
      })
      .where(eq(m.schema.userSettings.userId, "fabi"));
    await m.db.insert(m.schema.featureFlagOverrides).values(
      ["hilo", "fabi"].map((userId) => ({
        userId,
        key: "notificacoes_push",
        enabled: true,
      })),
    );
    await m.db.insert(m.schema.pushSubscriptions).values(
      ["hilo", "fabi"].map((userId) => ({
        userId,
        endpoint: endpointOf(userId),
        ...KEYS,
      })),
    );

    const pending = async (
      userId: string,
      bills: readonly (readonly [string, string])[],
    ) => {
      const ctx = await getUserContext(userId, { now: NOW.getTime() });
      const accountId = await createAccount(userId, {
        name: "Conta Principal",
        type: "checking",
        initialBalanceCents: 300_000,
      });
      const categories = await listCategories(userId);
      const category = categories.find((item) => item.name === "Moradia");
      if (!category) throw new Error("categoria Moradia");
      for (const [description, occurredOn] of bills) {
        await createTransaction(ctx, {
          kind: "expense",
          accountId,
          categoryId: category.id,
          description,
          amountCents: 10_000,
          occurredOn,
          paid: false,
        });
      }
    };
    // Monday the 9th is Hilo's tomorrow.
    await pending("hilo", [["Luz", "2026-11-09"]]);
    await pending("fabi", FABI_BILLS);
  }, 120_000);

  beforeEach(resetNotices);

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("takes each person's own date: still Sunday in Honolulu", async () => {
    const report = await run();
    expect(report).toMatchObject({ recipients: 4, processed: 4, errors: 0 });
    expect(sentTotal(report)).toBe(MONDAY_NOTICES);

    // The defaults, but no weekly summary: her Monday has not come yet.
    expect(sentTo("hilo")).toEqual([
      expect.objectContaining({ tag: "contas", title: "Luz vence amanhã" }),
    ]);
    expect((await noticesOf("hilo")).map((row) => row.dedupeKey)).toEqual([
      "bills_due:2026-11-08",
    ]);

    expect(sentTo("fabi")).toEqual([
      expect.objectContaining({
        tag: "contas",
        title: "4 contas vencem em breve",
        body: "Hoje: Água. Amanhã: Gás. Em 2 dias: Escola. Em 3 dias: Seguro.",
      }),
    ]);

    // Nobody's notice names someone else's bills.
    const texts = (userId: string) =>
      sentTo(userId)
        .map((push) => `${push.title} ${push.body}`)
        .join(" ");
    expect(texts("ana")).not.toMatch(/Condomínio|Feira|Luz|Água/);
    expect(texts("bruno")).not.toMatch(/Aluguel|Internet|Salário|Luz|Água/);
    expect(texts("fabi")).not.toMatch(/Aluguel|Condomínio|Luz/);
  });

  it("sends each notice once when two runs overlap", async () => {
    const [first, second] = await Promise.all([run(), run()]);
    expect(sentTotal(first) + sentTotal(second)).toBe(MONDAY_NOTICES);
    // What one run sent, the other found taken (or, for bills it read
    // after the claim, already announced: nothing to send).
    expect(
      first.alreadySent +
        second.alreadySent +
        first.nothingToSend +
        second.nothingToSend,
    ).toBe(MONDAY_NOTICES);
    expect(first.errors + second.errors).toBe(0);
    expect(first.undelivered + second.undelivered).toBe(0);
    expect(pushService.sent).toHaveLength(MONDAY_NOTICES);
    const pairs = pushService.sent.map(
      (push) => `${push.endpoint} ${String(push.body.tag)}`,
    );
    expect(new Set(pairs).size).toBe(MONDAY_NOTICES);
  });

  it("gives an undelivered notice back, and the next run sends it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    pushService.status.set(endpointOf("bruno"), 500);
    const failed = await run();
    expect(failed).toMatchObject({ undelivered: 2, errors: 0 });
    expect(sentTotal(failed)).toBe(MONDAY_NOTICES - 2);
    expect(sentTo("bruno")).toEqual([]);
    expect(await noticesOf("bruno")).toEqual([]);

    pushService.status.clear();
    const retried = await run();
    expect(retried).toMatchObject({
      undelivered: 0,
      alreadySent: MONDAY_NOTICES - 2,
      sent: { bills_due: 1, weekly_summary: 1 },
    });
    expect(sentTo("bruno").map((push) => push.tag)).toEqual([
      "contas",
      "resumo-semana",
    ]);
  });

  it("forgets a device the push service no longer knows", async () => {
    const { eq } = await import("drizzle-orm");
    const gone = "https://fcm.googleapis.com/fcm/send/bruno-celular-antigo";
    await m.db
      .insert(m.schema.pushSubscriptions)
      .values({ userId: "bruno", endpoint: gone, ...KEYS });
    pushService.status.set(gone, 410);

    const report = await run();
    expect(report).toMatchObject({ devicesRemoved: 1, undelivered: 0 });
    // The other device still got both.
    expect(sentTo("bruno")).toHaveLength(2);
    expect(
      await m.db
        .select({ id: m.schema.pushSubscriptions.id })
        .from(m.schema.pushSubscriptions)
        .where(eq(m.schema.pushSubscriptions.endpoint, gone)),
    ).toEqual([]);
  });

  it("announces each bill once before the due date and once overdue", async () => {
    const titles: Record<number, string[]> = {};
    for (let day = 9; day <= 17; day += 1) {
      pushService.sent = [];
      await m.reminders.sendDailyReminders({
        now: morningOf(day),
        deadline: Date.now() + 60_000,
      });
      titles[day] = sentTo("fabi").map((push) => push.title);
    }
    expect(titles).toEqual({
      9: ["4 contas vencem em breve"],
      10: ["Água venceu ontem"],
      11: ["Gás venceu ontem"],
      12: ["Escola venceu ontem"],
      13: ["Seguro venceu ontem"],
      14: [],
      15: [],
      16: [],
      17: [],
    });

    const keys = (await noticesOf("fabi")).flatMap((row) =>
      row.payload.type === "bills_due" ? (row.payload.itemKeys ?? []) : [],
    );
    expect(keys).toHaveLength(FABI_BILLS.length * 2);
    expect(new Set(keys).size).toBe(keys.length);
    for (const [, dueOn] of FABI_BILLS) {
      expect(keys.filter((key) => key.endsWith(`:${dueOn}`))).toHaveLength(1);
      expect(
        keys.filter((key) => key.endsWith(`:${dueOn}:vencida`)),
      ).toHaveLength(1);
    }
  });

  it("leaves whoever the deadline left out to the next run", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { sendReminders } = await import("./jobs/steps/send-reminders");

    const aborted = new AbortController();
    aborted.abort();
    const late = await sendReminders.run({
      signal: aborted.signal,
      startedAt: NOW,
    });
    expect(late).toMatchObject({
      status: "partial",
      error: "4 people not reached before the deadline",
      details: { recipients: 4, processed: 0, notReached: 4 },
    });
    expect(pushService.sent).toEqual([]);

    const past = await m.reminders.sendDailyReminders({
      now: NOW,
      deadline: Date.now(),
    });
    expect(past).toMatchObject({ processed: 0, notReached: 4 });

    const next = await sendReminders.run({
      signal: new AbortController().signal,
      startedAt: NOW,
    });
    expect(next).toMatchObject({
      status: "ok",
      details: { processed: 4, notReached: 0, alreadySent: 0 },
    });
    expect(pushService.sent).toHaveLength(MONDAY_NOTICES);
  });

  it("is skipped without the VAPID keys", async () => {
    const { sendReminders } = await import("./jobs/steps/send-reminders");
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    try {
      expect(
        await sendReminders.run({
          signal: new AbortController().signal,
          startedAt: NOW,
        }),
      ).toEqual({
        status: "skipped",
        reason: "Chaves VAPID não configuradas.",
      });
    } finally {
      process.env.VAPID_PRIVATE_KEY = privateKey;
    }
    expect(pushService.sent).toEqual([]);
  });

  it("records only counts in job_runs: no names, ids or amounts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { eq } = await import("drizzle-orm");
    const { runDailyJob } = await import("./jobs/daily");

    const summary = await runDailyJob();
    const step = summary.steps.find((entry) => entry.name === "sendReminders");
    expect(step).toMatchObject({
      status: "ok",
      details: {
        recipients: 4,
        processed: 4,
        sent: {
          daily_summary: 1,
          bills_due: 4,
          income_countdown: 1,
          weekly_summary: 2,
          monthly_summary: 1,
        },
      },
    });
    expect(pushService.sent).toHaveLength(MONDAY_NOTICES);

    const [row] = await m.db
      .select({ report: m.schema.jobRuns.report })
      .from(m.schema.jobRuns)
      .where(eq(m.schema.jobRuns.id, summary.runId));
    const stored = (
      row?.report as { steps: { name: string; details?: unknown }[] }
    ).steps.find((entry) => entry.name === "sendReminders");
    expect(stored).toEqual(step);
    // Every value in the step's details is a count.
    const counts = (value: unknown): boolean =>
      typeof value === "number" ||
      (typeof value === "object" &&
        value !== null &&
        Object.values(value).every(counts));
    expect(counts(stored?.details)).toBe(true);
    const text = JSON.stringify(row?.report);
    expect(text).not.toMatch(/R\$/);
    for (const word of [
      "ana",
      "bruno",
      "hilo",
      "fabi",
      "Aluguel",
      "Condomínio",
      "Salário",
      "push.apple.com",
    ]) {
      expect(text).not.toContain(word);
    }
  });

  it("counts the unread notices on the icon until the app is opened", async () => {
    const { markNotificationsRead, countUnreadNotifications } = await import(
      "./domain/push"
    );
    await run();
    expect(sentTo("ana").map((push) => push.badge)).toEqual([1, 2, 3, 4, 5]);
    expect(sentTo("bruno").map((push) => push.badge)).toEqual([1, 2]);

    // Ana opens the app: hers go to zero, Bruno's stay.
    await markNotificationsRead("ana");
    expect(await countUnreadNotifications("ana")).toBe(0);
    expect(await countUnreadNotifications("bruno")).toBe(2);

    // Tuesday: the number starts over from what is new.
    pushService.sent = [];
    await m.reminders.sendDailyReminders({
      now: morningOf(10),
      deadline: Date.now() + 60_000,
    });
    expect(sentTo("ana").map((push) => [push.tag, push.badge])).toEqual([
      ["resumo-dia", 1],
      ["contas", 2],
      ["receita", 3],
    ]);
    expect(sentTo("ana")[1]?.title).toBe("Internet venceu ontem");
  });
});
