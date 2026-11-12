// "Vencimento em dia não útil" (step sendReminders) against a real (in-memory)
// Postgres, with the push service mocked: Saturday 14/nov/2026 is the due
// date, Friday 13/nov the last business day before. Who gets the notice, once
// per bill, merged into "Contas a vencer" when that one already talks about
// the bill the same day, nothing with the flag off, and the preview.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  refresh: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
const pushService = vi.hoisted(() => ({
  sent: [] as { endpoint: string; body: Record<string, unknown> }[],
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

const KEYS = {
  p256dh:
    "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};
const endpointOf = (userId: string) => `https://web.push.apple.com/${userId}`;
/** 06:15 in São Paulo on a day of November 2026. */
const morningOf = (day: number) => new Date(Date.UTC(2026, 10, day, 9, 15));
const runOn = (day: number) =>
  m.reminders.sendDailyReminders({
    now: morningOf(day),
    deadline: Date.now() + 60_000,
  });

type Push = {
  title: string;
  body: string;
  tag: string;
  badge: number;
};
const sentTo = (userId: string) =>
  pushService.sent
    .filter((push) => push.endpoint === endpointOf(userId))
    .map((push) => push.body as Push);

const prefs = (
  events: { bills_due: boolean; non_business_due: boolean },
  billsLeadDays: 0 | 1 | 3,
) => ({
  events: {
    daily_summary: false,
    income_countdown: false,
    weekly_summary: false,
    monthly_summary: false,
    ...events,
  },
  billsLeadDays,
  showAmounts: true,
});

const resetNotices = () => m.db.delete(m.schema.notifications);

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("./db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("./db/schema");
  const { ensureOwnerDefaults } = await import("./db/seed-defaults");
  const { eq } = await import("drizzle-orm");
  const db = client.db;

  // Ana: both notices, a day ahead. Carla: both, three days ahead.
  // Dora: only the new one. Bruno: the new one on, but no flag.
  const people = {
    ana: prefs({ bills_due: true, non_business_due: true }, 1),
    carla: prefs({ bills_due: true, non_business_due: true }, 3),
    dora: prefs({ bills_due: false, non_business_due: true }, 1),
    bruno: prefs({ bills_due: false, non_business_due: true }, 1),
  } as const;
  await db.insert(schema.user).values(
    Object.keys(people).map((id) => ({
      id,
      name: id,
      email: `${id}@exemplo.com`,
    })),
  );
  for (const [id, notificationPrefs] of Object.entries(people)) {
    await ensureOwnerDefaults(id);
    await db
      .update(schema.userSettings)
      .set({ notificationPrefs })
      .where(eq(schema.userSettings.userId, id));
  }
  await db.insert(schema.featureFlagOverrides).values([
    ...Object.keys(people).map((userId) => ({
      userId,
      key: "notificacoes_push",
      enabled: true,
    })),
    ...["ana", "carla", "dora"].map((userId) => ({
      userId,
      key: "alerta_dia_nao_util",
      enabled: true,
    })),
  ]);
  await db.insert(schema.pushSubscriptions).values(
    Object.keys(people).map((userId) => ({
      userId,
      endpoint: endpointOf(userId),
      ...KEYS,
    })),
  );

  const { createAccount } = await import("./domain/accounts");
  const { listCategories } = await import("./domain/categories");
  const { createTransaction } = await import("./domain/transactions");
  const { getUserContext } = await import("./domain/context");
  const created = new Date(Date.UTC(2026, 10, 9, 9, 15)).getTime();
  for (const id of Object.keys(people)) {
    const ctx = await getUserContext(id, { now: created });
    const accountId = await createAccount(id, {
      name: "Conta Principal",
      type: "checking",
      initialBalanceCents: 500_000,
    });
    const categoryId = (await listCategories(id)).find(
      (category) => category.name === "Moradia",
    )?.id;
    if (!categoryId) throw new Error("categoria Moradia");
    await createTransaction(ctx, {
      kind: "expense",
      description: "Aluguel",
      amountCents: 210_000,
      occurredOn: "2026-11-14", // Saturday
      paid: false,
      accountId,
      categoryId,
    });
  }

  m = { db, schema, reminders: await import("./reminders") };
}, 120_000);

beforeEach(async () => {
  pushService.sent = [];
  await resetNotices();
});

describe("Vencimento em dia não útil", () => {
  it("goes out on the last business day, once, for who left it on with the flag", async () => {
    const first = await runOn(13);
    // Only Dora: for Ana and Carla, Contas a vencer named the bill first.
    expect(first.sent.non_business_due).toBe(1);
    expect(first.errors).toBe(0);

    const dora = sentTo("dora");
    expect(dora).toHaveLength(1);
    expect(dora[0]?.tag).toBe("dia-nao-util");
    expect(dora[0]?.title).toBe("Aluguel vence no sábado (14/nov)");
    expect(dora[0]?.body.replace(/\s/g, " ")).toBe(
      "R$ 2.100,00 · Conta Principal. Dia não útil: o pagamento costuma passar para seg, 16 nov. Se preferir não esperar, pague hoje.",
    );
    // The row counts as unread on the icon.
    expect(dora[0]?.badge).toBe(1);

    // A second run the same day sends nothing again.
    pushService.sent = [];
    const second = await runOn(13);
    expect(second.sent.non_business_due).toBe(0);
    expect(second.alreadySent).toBeGreaterThan(0);
    expect(pushService.sent).toEqual([]);
  });

  it("is not sent again on the due day itself", async () => {
    await runOn(13);
    pushService.sent = [];
    await runOn(14);
    expect(sentTo("dora")).toEqual([]);
  });

  it("goes out on the due day when nothing was said before (created late)", async () => {
    await runOn(14);
    const dora = sentTo("dora");
    expect(dora.map((push) => push.title)).toEqual([
      "Aluguel vence hoje, sábado",
    ]);
    expect(dora[0]?.body).not.toMatch(/pague hoje/);
  });

  it("never goes out once the due date has passed, or earlier than the last business day", async () => {
    await runOn(15);
    await runOn(12);
    expect(sentTo("dora")).toEqual([]);
  });

  it("is one push a day: Contas a vencer already named the bill, so it carries the note", async () => {
    await runOn(13);
    const ana = sentTo("ana");
    expect(ana).toHaveLength(1);
    expect(ana[0]?.tag).toBe("contas");
    expect(ana[0]?.body).toContain(
      "Cai num sábado: o pagamento costuma passar para seg, 16 nov.",
    );
  });

  it("with three days of lead, Contas a vencer comes first (with the note) and the new notice on Friday", async () => {
    await runOn(11);
    const wednesday = sentTo("carla");
    expect(wednesday.map((push) => push.tag)).toEqual(["contas"]);
    expect(wednesday[0]?.body).toContain("Cai num sábado");
    // The Wednesday notice was not reset: Friday sends only the new one.
    pushService.sent = [];
    await runOn(13);
    expect(sentTo("carla").map((push) => push.tag)).toEqual(["dia-nao-util"]);
  });

  it("sends nothing without the flag, and the person is not counted as a recipient", async () => {
    const report = await runOn(13);
    expect(sentTo("bruno")).toEqual([]);
    // Ana, Carla and Dora: Bruno only has the flagged notice left on.
    expect(report.recipients).toBe(3);
  });

  it("stops when the flag is turned off for the person, and the choice stays saved", async () => {
    const { and, eq } = await import("drizzle-orm");
    const overrides = m.schema.featureFlagOverrides;
    await m.db
      .update(overrides)
      .set({ enabled: false })
      .where(
        and(
          eq(overrides.userId, "dora"),
          eq(overrides.key, "alerta_dia_nao_util"),
        ),
      );
    try {
      const report = await runOn(13);
      expect(sentTo("dora")).toEqual([]);
      expect(report.recipients).toBe(2);
      const [saved] = await m.db
        .select({ prefs: m.schema.userSettings.notificationPrefs })
        .from(m.schema.userSettings)
        .where(eq(m.schema.userSettings.userId, "dora"));
      expect(saved?.prefs?.events?.non_business_due).toBe(true);
    } finally {
      await m.db
        .update(overrides)
        .set({ enabled: true })
        .where(
          and(
            eq(overrides.userId, "dora"),
            eq(overrides.key, "alerta_dia_nao_util"),
          ),
        );
    }
  });

  it("records the bill keys in the notice, under its own dedupe key", async () => {
    await runOn(13);
    const { eq } = await import("drizzle-orm");
    const rows = await m.db
      .select({
        dedupeKey: m.schema.notifications.dedupeKey,
        payload: m.schema.notifications.payload,
      })
      .from(m.schema.notifications)
      .where(eq(m.schema.notifications.userId, "dora"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dedupeKey).toBe("non_business_due:2026-11-13");
    const payload = rows[0]?.payload;
    expect(payload?.type).toBe("non_business_due");
    expect(payload?.type === "non_business_due" && payload.itemKeys).toEqual([
      expect.stringMatching(/^t:.+:2026-11-14$/),
    ]);
  });
});

describe("preview of Vencimento em dia não útil", () => {
  it("includes it for who has the flag, from today up to 7 days ahead, and records nothing", async () => {
    const outcome = await m.reminders.previewReminders(
      "dora",
      endpointOf("dora"),
      morningOf(11),
    );
    expect(outcome).toEqual({ built: 1, sent: 1, removed: false });
    expect(sentTo("dora").map((push) => push.tag)).toEqual([
      "previa-non_business_due",
    ]);
    const rows = await m.db.select().from(m.schema.notifications);
    expect(rows).toEqual([]);
  });

  it("leaves it out without the flag", async () => {
    const outcome = await m.reminders.previewReminders(
      "bruno",
      endpointOf("bruno"),
      morningOf(11),
    );
    expect(outcome.built).toBe(0);
    expect(sentTo("bruno")).toEqual([]);
  });
});
