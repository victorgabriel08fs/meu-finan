// The daily notices (step sendReminders) against a real (in-memory)
// Postgres, with the push service mocked, on Monday 09/nov/2026 at 06:15 in
// São Paulo: who gets which notice, with and without amounts, and a second
// run the same day sending nothing again.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
// The signed-in administrator for the preview, normally from the session.
const signedIn = vi.hoisted(() => ({
  admin: null as null | { id: string; name: string; role: string },
}));
vi.mock("@/server/dal", () => ({
  requireUser: async () => null,
  getAdmin: async () => signedIn.admin,
  getSession: async () => null,
}));
// The push service: records what would be sent.
const pushService = vi.hoisted(() => ({
  sent: [] as { endpoint: string; body: Record<string, unknown> }[],
}));
vi.mock("web-push", () => {
  class WebPushError extends Error {
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
    .map((push) => push.body as { title: string; body: string; tag: string });

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
